/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import { checkGitLabProjectAccess, getGitLabCurrentUsername } from "./client";
import { resolveGitLabServerUrl } from "./server-url";
import type {
  GitLabApiError,
  GitLabConnectionDecryptError,
  GitLabConnectionError,
  GitLabConnectionSummary,
} from "./types";

type GitLabConnectionRow = typeof schema.gitlabConnections.$inferSelect;

const GITLAB_NOT_RECOGNIZED: GitLabConnectionError = {
  code: "gitlab_server_not_recognized",
  message: "This address answered, but not like a GitLab server. Check the address.",
};

const GITLAB_CONNECTION_NOT_FOUND: GitLabConnectionError = {
  code: "gitlab_connection_not_found",
  message: "This GitLab connection no longer exists.",
};

const TOKEN_CHARACTERS = /^[\x21-\x7e]+$/;
const NAME_MAX_LENGTH = 80;

/** A connection saved before names is called by its server's host. */
export function gitlabConnectionDisplayName(row: { name: string | null; serverUrl: string }) {
  const name = row.name?.trim();
  if (name) {
    return name;
  }
  try {
    return new URL(row.serverUrl).host;
  } catch {
    return row.serverUrl;
  }
}

/** The default connection first, then the rest by when they were made. */
const connectionOrder = [
  desc(schema.gitlabConnections.isDefault),
  asc(schema.gitlabConnections.createdAt),
  asc(schema.gitlabConnections.id),
];

/**
 * Project syncs whose settings name the connection. Written out in full: inside a subquery the
 * query builder drops the table from column names, which would compare each row to itself.
 */
const syncCountSql = sql<number>`(
  select count(*)::int from project_content_syncs as sync
  where sync.organization_id = gitlab_connections.organization_id
    and sync.sync_config ->> 'gitlabConnectionId' = gitlab_connections.id::text
)`;

function serializeConnection(
  row: GitLabConnectionRow,
  input: { isDefault: boolean; syncCount: number },
): GitLabConnectionSummary {
  return {
    id: row.id,
    name: gitlabConnectionDisplayName(row),
    isDefault: input.isDefault,
    serverUrl: row.serverUrl,
    connectedUsername: row.connectedUsername,
    maskedTokenSuffix: row.maskedTokenSuffix,
    updatedAt: row.updatedAt.toISOString(),
    syncCount: input.syncCount,
  };
}

function mapCheckError(error: GitLabApiError): GitLabConnectionError {
  if (error.code === "gitlab_unauthorized") {
    return {
      code: "gitlab_token_rejected",
      message:
        "The server refused this token. Check that it is active and has the api scope (or read_api and read_repository), and that nothing is blocking the request.",
    };
  }
  if (error.code === "gitlab_not_found") {
    return GITLAB_NOT_RECOGNIZED;
  }
  if (error.code === "gitlab_request_failed" && error.status >= 200 && error.status < 300) {
    return GITLAB_NOT_RECOGNIZED;
  }
  if (error.code === "gitlab_request_failed" && error.timedOut) {
    return {
      code: "gitlab_server_unreachable",
      message:
        "This address didn't answer in time. Check it's correct and reachable from the internet.",
    };
  }
  if (error.code === "gitlab_request_failed" && error.status > 0) {
    return {
      code: "gitlab_server_unreachable",
      message: "This address answered with an error. Check the address, or try again shortly.",
    };
  }
  return {
    code: "gitlab_server_unreachable",
    message:
      "Could not connect to this address. Check it is correct, has a valid certificate, and doesn't redirect to another address.",
  };
}

/** Finds who the token belongs to, and that it can read projects: read_user alone passes the first. */
async function checkGitLabServer(input: {
  baseUrl: string;
  accessToken: string;
  signal?: AbortSignal;
}): Promise<Result<string, GitLabConnectionError>> {
  // The first failure is the answer: it stops the other request, whose own failure is then only
  // that it was stopped.
  const controller = new AbortController();
  const signal = input.signal
    ? AbortSignal.any([input.signal, controller.signal])
    : controller.signal;
  const first: { error: GitLabApiError | null } = { error: null };
  const stopOnFailure = <T extends Result<unknown, GitLabApiError>>(result: T): T => {
    if (isErr(result) && !first.error) {
      first.error = result.error;
      controller.abort();
    }
    return result;
  };
  const access = { baseUrl: input.baseUrl, accessToken: input.accessToken, signal };
  const [username] = await Promise.all([
    getGitLabCurrentUsername(access).then(stopOnFailure),
    checkGitLabProjectAccess(access).then(stopOnFailure),
  ]);
  if (first.error) {
    return err(mapCheckError(first.error));
  }

  return isErr(username) ? err(mapCheckError(username.error)) : username;
}

async function listRows(organizationId: string) {
  return db
    .select({ ...getTableColumns(schema.gitlabConnections), syncCount: syncCountSql })
    .from(schema.gitlabConnections)
    .where(eq(schema.gitlabConnections.organizationId, organizationId))
    .orderBy(...connectionOrder);
}

/**
 * The workspace's connections, the default first. Exactly one is the default while any exist:
 * the one marked, else the oldest, so a workspace from before the flag keeps its connection.
 */
export async function listGitLabConnections(input: {
  organizationId: string;
}): Promise<GitLabConnectionSummary[]> {
  const rows = await listRows(input.organizationId);
  return rows.map((row, index) =>
    serializeConnection(row, { isDefault: index === 0, syncCount: row.syncCount }),
  );
}

/** The default connection, which chat and automations use; null when the workspace has none. */
export async function getGitLabConnection(input: {
  organizationId: string;
}): Promise<GitLabConnectionSummary | null> {
  const [row] = await db
    .select({ ...getTableColumns(schema.gitlabConnections), syncCount: syncCountSql })
    .from(schema.gitlabConnections)
    .where(eq(schema.gitlabConnections.organizationId, input.organizationId))
    .orderBy(...connectionOrder)
    .limit(1);

  return row ? serializeConnection(row, { isDefault: true, syncCount: row.syncCount }) : null;
}

/** One connection by id; null when it isn't the workspace's. */
export async function findGitLabConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<GitLabConnectionSummary | null> {
  const rows = await listRows(input.organizationId);
  const index = rows.findIndex((row) => row.id === input.connectionId);
  const row = rows[index];
  return row
    ? serializeConnection(row, { isDefault: index === 0, syncCount: row.syncCount })
    : null;
}

function normalizeName(name: string | null | undefined): string | null {
  const trimmed = name?.trim().slice(0, NAME_MAX_LENGTH) ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Adds a connection, or replaces the one named by `connectionId`. The token is required on
 * every save, so a stored one can't be pointed at a new address. The first connection a
 * workspace saves becomes its default.
 */
export async function saveGitLabConnection(input: {
  organizationId: string;
  userId: string;
  connectionId?: string | null;
  name?: string | null;
  serverUrl: string;
  accessToken: string;
  signal?: AbortSignal;
}): Promise<
  Result<{ connection: GitLabConnectionSummary; created: boolean }, GitLabConnectionError>
> {
  const baseUrl = await resolveGitLabServerUrl(input.serverUrl);
  if (isErr(baseUrl)) {
    return baseUrl;
  }

  const accessToken = input.accessToken.trim();
  if (!TOKEN_CHARACTERS.test(accessToken)) {
    return err({
      code: "gitlab_token_invalid",
      message: "This doesn't look like an access token. Copy it again without spaces.",
    });
  }

  const username = await checkGitLabServer({
    baseUrl: baseUrl.value,
    accessToken,
    signal: input.signal,
  });
  if (isErr(username)) {
    return username;
  }

  const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential(accessToken));
  const fields = {
    updatedByUserId: input.userId,
    name: normalizeName(input.name),
    serverUrl: baseUrl.value,
    connectedUsername: username.value,
    encryptionAlgorithm: encrypted.algorithm,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
    maskedTokenSuffix: maskProviderCredentialSuffix(accessToken),
    // An update does not run $onUpdateFn here, so a replace would keep the first save's time.
    updatedAt: new Date(),
  };

  if (input.connectionId) {
    const [row] = await db
      .update(schema.gitlabConnections)
      .set(fields)
      .where(
        and(
          eq(schema.gitlabConnections.organizationId, input.organizationId),
          eq(schema.gitlabConnections.id, input.connectionId),
        ),
      )
      .returning({ id: schema.gitlabConnections.id });
    if (!row) {
      return err(GITLAB_CONNECTION_NOT_FOUND);
    }
    const saved = await findGitLabConnection({
      organizationId: input.organizationId,
      connectionId: row.id,
    });
    if (!saved) {
      throw new Error("gitlab_connection_save_failed");
    }
    return ok({ connection: saved, created: false });
  }

  const [row] = await db
    .insert(schema.gitlabConnections)
    .values({ ...fields, organizationId: input.organizationId, createdByUserId: input.userId })
    .returning({ id: schema.gitlabConnections.id });
  if (!row) {
    throw new Error("gitlab_connection_save_failed");
  }
  const saved = await findGitLabConnection({
    organizationId: input.organizationId,
    connectionId: row.id,
  });
  if (!saved) {
    throw new Error("gitlab_connection_save_failed");
  }
  return ok({ connection: saved, created: true });
}

/** Marks one connection as the workspace's default; false when it isn't the workspace's. */
export async function setDefaultGitLabConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: schema.gitlabConnections.id })
      .from(schema.gitlabConnections)
      .where(
        and(
          eq(schema.gitlabConnections.organizationId, input.organizationId),
          eq(schema.gitlabConnections.id, input.connectionId),
        ),
      )
      .limit(1);
    if (!row) {
      return false;
    }
    await tx
      .update(schema.gitlabConnections)
      .set({ isDefault: false })
      .where(
        and(
          eq(schema.gitlabConnections.organizationId, input.organizationId),
          eq(schema.gitlabConnections.isDefault, true),
        ),
      );
    await tx
      .update(schema.gitlabConnections)
      .set({ isDefault: true })
      .where(eq(schema.gitlabConnections.id, row.id));
    return true;
  });
}

/** Removes one connection. With the default gone, the oldest remaining one takes its place. */
export async function deleteGitLabConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<boolean> {
  const rows = await db
    .delete(schema.gitlabConnections)
    .where(
      and(
        eq(schema.gitlabConnections.organizationId, input.organizationId),
        eq(schema.gitlabConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.gitlabConnections.id });

  return rows.length > 0;
}

export type GitLabConnectionCredentials = { id: string; baseUrl: string; accessToken: string };

/**
 * The token of one connection, or of the default when none is named. Null when the workspace
 * has no connection, or the named one was removed.
 */
export async function loadGitLabConnectionCredentials(input: {
  organizationId: string;
  connectionId?: string | null;
}): Promise<Result<GitLabConnectionCredentials | null, GitLabConnectionDecryptError>> {
  const [row] = await db
    .select()
    .from(schema.gitlabConnections)
    .where(
      and(
        eq(schema.gitlabConnections.organizationId, input.organizationId),
        ...(input.connectionId ? [eq(schema.gitlabConnections.id, input.connectionId)] : []),
      ),
    )
    .orderBy(...connectionOrder)
    .limit(1);

  if (!row) {
    return ok(null);
  }

  const decrypted = decryptProviderCredential({
    algorithm: row.encryptionAlgorithm,
    keyVersion: row.keyVersion,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  if (isErr(decrypted)) {
    return err({
      code: "gitlab_connection_decrypt_failed",
      message: "Unable to read the saved GitLab token. Connect GitLab again.",
    });
  }

  return ok({ id: row.id, baseUrl: row.serverUrl, accessToken: decrypted.value });
}

/** Runs the save check again on a stored token, which can stop working at any time. */
export async function checkSavedGitLabConnection(input: {
  organizationId: string;
  connectionId?: string | null;
  signal?: AbortSignal;
}): Promise<Result<"working" | "not_connected", GitLabConnectionError>> {
  const credentials = await loadGitLabConnectionCredentials(input);
  if (isErr(credentials)) {
    return credentials;
  }
  if (!credentials.value) {
    return ok("not_connected");
  }

  const username = await checkGitLabServer({ ...credentials.value, signal: input.signal });
  return isErr(username) ? username : ok("working");
}
