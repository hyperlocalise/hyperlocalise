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
import { z } from "zod";

import { db, schema } from "@/lib/database/client";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import { checkBitbucketRepositoryAccess, getBitbucketCurrentAccount } from "./client";
import type {
  BitbucketAccess,
  BitbucketApiError,
  BitbucketConnectionCheck,
  BitbucketConnectionDecryptError,
  BitbucketConnectionError,
  BitbucketConnectionSummary,
} from "./types";

type BitbucketConnectionRow = typeof schema.bitbucketConnections.$inferSelect;

const BITBUCKET_CONNECTION_NOT_FOUND: BitbucketConnectionError = {
  code: "bitbucket_connection_not_found",
  message: "This Bitbucket connection no longer exists.",
};

const TOKEN_CHARACTERS = /^[\x21-\x7e]+$/;
const NAME_MAX_LENGTH = 80;
const FALLBACK_NAME = "Bitbucket";

/** A connection without a name is called by its account, else its email. */
export function bitbucketConnectionDisplayName(row: {
  name: string | null;
  connectedAccount: string | null;
  accountEmail: string | null;
}): string {
  return (
    row.name?.trim() || row.connectedAccount?.trim() || row.accountEmail?.trim() || FALLBACK_NAME
  );
}

/** The default first, then by when they were made. Built when asked, so tests can replace the client. */
function connectionOrder() {
  return [
    desc(schema.bitbucketConnections.isDefault),
    asc(schema.bitbucketConnections.createdAt),
    asc(schema.bitbucketConnections.id),
  ];
}

/** Project syncs whose settings name the connection; written out in full for the subquery. */
const syncCountSql = sql<number>`(
  select count(*)::int from project_content_syncs as sync
  where sync.organization_id = bitbucket_connections.organization_id
    and sync.sync_config ->> 'bitbucketConnectionId' = bitbucket_connections.id::text
)`;

function serializeConnection(
  row: BitbucketConnectionRow,
  input: { isDefault: boolean; syncCount: number },
): BitbucketConnectionSummary {
  return {
    id: row.id,
    name: bitbucketConnectionDisplayName(row),
    storedName: row.name,
    isDefault: input.isDefault,
    accountEmail: row.accountEmail,
    connectedAccount: row.connectedAccount,
    maskedTokenSuffix: row.maskedTokenSuffix,
    updatedAt: row.updatedAt.toISOString(),
    syncCount: input.syncCount,
  };
}

function mapCheckError(error: BitbucketApiError): BitbucketConnectionError {
  if (error.code === "bitbucket_unauthorized" || error.code === "bitbucket_forbidden") {
    return {
      code: "bitbucket_token_rejected",
      message:
        "Bitbucket refused this token. Check that it is active and can read repositories, and that an API token is entered with its Atlassian account email.",
    };
  }
  if (error.code === "bitbucket_request_failed" && error.timedOut) {
    return {
      code: "bitbucket_unreachable",
      message: "Bitbucket didn't answer in time. Try again shortly.",
    };
  }
  return {
    code: "bitbucket_unreachable",
    message: "Bitbucket couldn't be reached. Try again shortly.",
  };
}

type BitbucketCheck = BitbucketConnectionCheck & { account: string | null };

/** Finds who the token belongs to, where it may say, and whether it reads any repository. */
async function checkBitbucketToken(
  input: BitbucketAccess & { signal?: AbortSignal },
): Promise<Result<BitbucketCheck, BitbucketConnectionError>> {
  const repositories = await checkBitbucketRepositoryAccess(input);
  if (isErr(repositories)) {
    return err(mapCheckError(repositories.error));
  }
  // The account is extra: an access token may not be allowed to say, which never fails the check.
  const account = await getBitbucketCurrentAccount(input);
  return ok({
    account: isErr(account) ? null : account.value,
    readsRepositories: repositories.value.readsRepositories,
  });
}

async function listRows(organizationId: string) {
  return db
    .select({ ...getTableColumns(schema.bitbucketConnections), syncCount: syncCountSql })
    .from(schema.bitbucketConnections)
    .where(eq(schema.bitbucketConnections.organizationId, organizationId))
    .orderBy(...connectionOrder());
}

/** The workspace's connections, the default first: the one marked, else the oldest. */
export async function listBitbucketConnections(input: {
  organizationId: string;
}): Promise<BitbucketConnectionSummary[]> {
  const rows = await listRows(input.organizationId);
  return rows.map((row, index) =>
    serializeConnection(row, { isDefault: index === 0, syncCount: row.syncCount }),
  );
}

/** One connection by id; null when it isn't the workspace's. */
export async function findBitbucketConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<BitbucketConnectionSummary | null> {
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
 * Adds a connection, or replaces the one named by `connectionId`. The token is required on every
 * save. Saving checks the token first; a failed check saves nothing.
 */
export async function saveBitbucketConnection(input: {
  organizationId: string;
  userId: string;
  connectionId?: string | null;
  name?: string | null;
  accountEmail?: string | null;
  accessToken: string;
  signal?: AbortSignal;
}): Promise<
  Result<
    { connection: BitbucketConnectionSummary; created: boolean; check: BitbucketConnectionCheck },
    BitbucketConnectionError
  >
> {
  const accessToken = input.accessToken.trim();
  if (!TOKEN_CHARACTERS.test(accessToken)) {
    return err({
      code: "bitbucket_token_invalid",
      message: "This doesn't look like a token. Copy it again without spaces.",
    });
  }
  const accountEmail = input.accountEmail?.trim() || null;
  if (accountEmail && !z.string().email().safeParse(accountEmail).success) {
    return err({
      code: "bitbucket_email_invalid",
      message: "Enter the email address of the Atlassian account the API token belongs to.",
    });
  }

  const checked = await checkBitbucketToken({ accessToken, accountEmail, signal: input.signal });
  if (isErr(checked)) {
    return checked;
  }
  const check: BitbucketConnectionCheck = { readsRepositories: checked.value.readsRepositories };

  const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential(accessToken));
  const fields = {
    updatedByUserId: input.userId,
    name: normalizeName(input.name),
    accountEmail,
    connectedAccount: checked.value.account,
    encryptionAlgorithm: encrypted.algorithm,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
    maskedTokenSuffix: maskProviderCredentialSuffix(accessToken),
    // Set outright: the live-check key reads it, so a replace must move it.
    updatedAt: new Date(),
  };

  let id: string;
  let created: boolean;
  if (input.connectionId) {
    const [row] = await db
      .update(schema.bitbucketConnections)
      .set(fields)
      .where(
        and(
          eq(schema.bitbucketConnections.organizationId, input.organizationId),
          eq(schema.bitbucketConnections.id, input.connectionId),
        ),
      )
      .returning({ id: schema.bitbucketConnections.id });
    if (!row) {
      return err(BITBUCKET_CONNECTION_NOT_FOUND);
    }
    id = row.id;
    created = false;
  } else {
    const [row] = await db
      .insert(schema.bitbucketConnections)
      .values({ ...fields, organizationId: input.organizationId, createdByUserId: input.userId })
      .returning({ id: schema.bitbucketConnections.id });
    if (!row) {
      throw new Error("bitbucket_connection_save_failed");
    }
    id = row.id;
    created = true;
  }

  const saved = await findBitbucketConnection({
    organizationId: input.organizationId,
    connectionId: id,
  });
  if (!saved) {
    throw new Error("bitbucket_connection_save_failed");
  }
  return ok({ connection: saved, created, check });
}

/**
 * Marks one connection as the default; false when it isn't the workspace's. The workspace's rows
 * are locked first, so two admins marking at once take turns rather than one failing on the index.
 */
export async function setDefaultBitbucketConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: schema.bitbucketConnections.id })
      .from(schema.bitbucketConnections)
      .where(eq(schema.bitbucketConnections.organizationId, input.organizationId))
      .for("update");
    if (!rows.some((row) => row.id === input.connectionId)) {
      return false;
    }
    const keepUpdatedAt = sql`${schema.bitbucketConnections.updatedAt}`;
    await tx
      .update(schema.bitbucketConnections)
      .set({ isDefault: false, updatedAt: keepUpdatedAt })
      .where(
        and(
          eq(schema.bitbucketConnections.organizationId, input.organizationId),
          eq(schema.bitbucketConnections.isDefault, true),
        ),
      );
    await tx
      .update(schema.bitbucketConnections)
      .set({ isDefault: true, updatedAt: keepUpdatedAt })
      .where(eq(schema.bitbucketConnections.id, input.connectionId));
    return true;
  });
}

/** Removes one connection. With the default gone, the oldest remaining one takes its place. */
export async function deleteBitbucketConnection(input: {
  organizationId: string;
  connectionId: string;
}): Promise<boolean> {
  const rows = await db
    .delete(schema.bitbucketConnections)
    .where(
      and(
        eq(schema.bitbucketConnections.organizationId, input.organizationId),
        eq(schema.bitbucketConnections.id, input.connectionId),
      ),
    )
    .returning({ id: schema.bitbucketConnections.id });
  return rows.length > 0;
}

export type BitbucketConnectionCredentials = BitbucketAccess & { id: string };

/**
 * The token of one connection, or of the default when none is named. Null when the workspace has
 * no connection, or the named one was removed.
 */
export async function loadBitbucketConnectionCredentials(input: {
  organizationId: string;
  connectionId?: string | null;
}): Promise<Result<BitbucketConnectionCredentials | null, BitbucketConnectionDecryptError>> {
  const [row] = await db
    .select()
    .from(schema.bitbucketConnections)
    .where(
      and(
        eq(schema.bitbucketConnections.organizationId, input.organizationId),
        ...(input.connectionId ? [eq(schema.bitbucketConnections.id, input.connectionId)] : []),
      ),
    )
    .orderBy(...connectionOrder())
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
      code: "bitbucket_connection_decrypt_failed",
      message: "Unable to read the saved Bitbucket token. Save the connection again.",
    });
  }
  return ok({ id: row.id, accessToken: decrypted.value, accountEmail: row.accountEmail });
}

/** Runs the save check again on a stored token, which can stop working at any time. */
export async function checkSavedBitbucketConnection(input: {
  organizationId: string;
  connectionId?: string | null;
  signal?: AbortSignal;
}): Promise<Result<BitbucketConnectionCheck | "not_connected", BitbucketConnectionError>> {
  const credentials = await loadBitbucketConnectionCredentials(input);
  if (isErr(credentials)) {
    return credentials;
  }
  if (!credentials.value) {
    return ok("not_connected");
  }
  const checked = await checkBitbucketToken({ ...credentials.value, signal: input.signal });
  return isErr(checked) ? checked : ok({ readsRepositories: checked.value.readsRepositories });
}

/** The connection a sync runs with: the one it names, else the default. */
export async function resolveBitbucketAccess(input: {
  organizationId: string;
  connectionId?: string | null;
}): Promise<Result<BitbucketConnectionCredentials, BitbucketApiError>> {
  const credentials = await loadBitbucketConnectionCredentials(input);
  if (isErr(credentials)) {
    return credentials;
  }
  if (credentials.value) {
    return ok(credentials.value);
  }
  return err(
    input.connectionId
      ? {
          code: "bitbucket_connection_removed",
          message: "The Bitbucket connection this uses was removed in Integrations.",
        }
      : {
          code: "bitbucket_not_connected",
          message: "Connect Bitbucket in Integrations before using it.",
        },
  );
}
