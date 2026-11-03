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

import { eq, getTableColumns, sql } from "drizzle-orm";

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

const TOKEN_CHARACTERS = /^[\x21-\x7e]+$/;

function serializeConnection(row: GitLabConnectionRow): GitLabConnectionSummary {
  return {
    serverUrl: row.serverUrl,
    connectedUsername: row.connectedUsername,
    maskedTokenSuffix: row.maskedTokenSuffix,
    updatedAt: row.updatedAt.toISOString(),
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

export async function getGitLabConnection(input: {
  organizationId: string;
}): Promise<GitLabConnectionSummary | null> {
  const [row] = await db
    .select()
    .from(schema.gitlabConnections)
    .where(eq(schema.gitlabConnections.organizationId, input.organizationId))
    .limit(1);

  return row ? serializeConnection(row) : null;
}

/**
 * The token is required on every save, so a stored one can't be pointed at a new address.
 * `created` is true when the workspace had no connection before.
 */
export async function saveGitLabConnection(input: {
  organizationId: string;
  userId: string;
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
    serverUrl: baseUrl.value,
    connectedUsername: username.value,
    encryptionAlgorithm: encrypted.algorithm,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
    maskedTokenSuffix: maskProviderCredentialSuffix(accessToken),
  };

  const [row] = await db
    .insert(schema.gitlabConnections)
    .values({ ...fields, organizationId: input.organizationId, createdByUserId: input.userId })
    .onConflictDoUpdate({ target: schema.gitlabConnections.organizationId, set: fields })
    // Postgres leaves xmax at 0 on a row this statement inserted rather than updated.
    .returning({
      ...getTableColumns(schema.gitlabConnections),
      created: sql<boolean>`(xmax = 0)`,
    });

  if (!row) {
    throw new Error("gitlab_connection_save_failed");
  }

  return ok({ connection: serializeConnection(row), created: row.created });
}

export async function deleteGitLabConnection(input: { organizationId: string }): Promise<boolean> {
  const rows = await db
    .delete(schema.gitlabConnections)
    .where(eq(schema.gitlabConnections.organizationId, input.organizationId))
    .returning({ id: schema.gitlabConnections.id });

  return rows.length > 0;
}

export async function loadGitLabConnectionCredentials(input: {
  organizationId: string;
}): Promise<Result<{ baseUrl: string; accessToken: string } | null, GitLabConnectionDecryptError>> {
  const [row] = await db
    .select()
    .from(schema.gitlabConnections)
    .where(eq(schema.gitlabConnections.organizationId, input.organizationId))
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

  return ok({ baseUrl: row.serverUrl, accessToken: decrypted.value });
}

/** Runs the save check again on the stored token, which can stop working at any time. */
export async function checkSavedGitLabConnection(input: {
  organizationId: string;
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
