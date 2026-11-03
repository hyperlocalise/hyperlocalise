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

import { eq } from "drizzle-orm";

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
import type { GitLabApiError, GitLabConnectionError, GitLabConnectionSummary } from "./types";

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
}): Promise<Result<string, GitLabConnectionError>> {
  const [username, projects] = await Promise.all([
    getGitLabCurrentUsername(input),
    checkGitLabProjectAccess(input),
  ]);
  if (isErr(username)) {
    return err(mapCheckError(username.error));
  }
  if (isErr(projects)) {
    return err(mapCheckError(projects.error));
  }

  return username;
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

/** The token is required on every save, so a stored one can't be pointed at a new address. */
export async function saveGitLabConnection(input: {
  organizationId: string;
  userId: string;
  serverUrl: string;
  accessToken: string;
}): Promise<Result<GitLabConnectionSummary, GitLabConnectionError>> {
  const baseUrl = await resolveGitLabServerUrl(input.serverUrl);
  if (isErr(baseUrl)) {
    return baseUrl;
  }

  const accessToken = input.accessToken.trim();
  if (!TOKEN_CHARACTERS.test(accessToken)) {
    return err({
      code: "gitlab_token_rejected",
      message: "This doesn't look like an access token. Copy it again without spaces.",
    });
  }

  const username = await checkGitLabServer({ baseUrl: baseUrl.value, accessToken });
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
    .returning();

  if (!row) {
    throw new Error("gitlab_connection_save_failed");
  }

  return ok(serializeConnection(row));
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
}): Promise<
  Result<
    { baseUrl: string; accessToken: string } | null,
    { code: "gitlab_connection_decrypt_failed"; message: string }
  >
> {
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
