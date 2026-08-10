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
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema, type DatabaseClient } from "@/lib/database";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { refreshGitlabAccessToken, type GitlabOAuthTokenBundle } from "./oauth";

const TOKEN_REFRESH_SKEW_MS = 60_000;

const tokenBundleSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable(),
  tokenType: z.string().min(1),
  scope: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

export type GitlabConnectionTokenError =
  | { code: "gitlab_connection_not_found" }
  | { code: "gitlab_token_decrypt_failed" }
  | { code: "gitlab_token_bundle_invalid" }
  | { code: "gitlab_refresh_token_missing" }
  | { code: "gitlab_token_refresh_failed"; message: string };

function encryptTokenBundle(bundle: GitlabOAuthTokenBundle) {
  return unwrapProviderCredentialCrypto(encryptProviderCredential(JSON.stringify(bundle)));
}

function decryptTokenBundle(connection: {
  encryptionAlgorithm: string;
  keyVersion: number;
  ciphertext: string;
  iv: string;
  authTag: string;
}): Result<GitlabOAuthTokenBundle, GitlabConnectionTokenError> {
  const decrypted = decryptProviderCredential({
    algorithm: connection.encryptionAlgorithm,
    keyVersion: connection.keyVersion,
    ciphertext: connection.ciphertext,
    iv: connection.iv,
    authTag: connection.authTag,
  });
  if (isErr(decrypted)) {
    return err({ code: "gitlab_token_decrypt_failed" });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(decrypted.value);
  } catch {
    return err({ code: "gitlab_token_bundle_invalid" });
  }

  const parsed = tokenBundleSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return err({ code: "gitlab_token_bundle_invalid" });
  }

  return ok(parsed.data);
}

function isAccessTokenFresh(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) {
    // Unknown expiry — treat as usable and refresh on failure later.
    return true;
  }

  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) {
    return false;
  }

  return expiresMs - TOKEN_REFRESH_SKEW_MS > now.getTime();
}

export function buildEncryptedGitlabTokenFields(bundle: GitlabOAuthTokenBundle) {
  const encrypted = encryptTokenBundle(bundle);
  return {
    oauthExpiresAt: bundle.expiresAt ? new Date(bundle.expiresAt) : null,
    encryptionAlgorithm: encrypted.algorithm,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
  };
}

/**
 * Return a usable GitLab access token for the connection, refreshing when needed.
 */
export async function getGitlabAccessToken(input: {
  organizationId: string;
  connectionId?: string;
  database?: DatabaseClient;
}): Promise<
  Result<
    {
      accessToken: string;
      baseUrl: string;
      connectionId: string;
    },
    GitlabConnectionTokenError
  >
> {
  const database = input.database ?? db;

  return database.transaction(async (tx) => {
    // Advisory lock keyed by organization to avoid concurrent refresh races.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`gitlab-token:${input.organizationId}`}))`,
    );

    const [connection] = await tx
      .select()
      .from(schema.gitlabConnections)
      .where(eq(schema.gitlabConnections.organizationId, input.organizationId))
      .limit(1);

    if (!connection || (input.connectionId && connection.id !== input.connectionId)) {
      return err({ code: "gitlab_connection_not_found" });
    }

    const bundleResult = decryptTokenBundle(connection);
    if (isErr(bundleResult)) {
      return bundleResult;
    }

    const bundle = bundleResult.value;
    if (isAccessTokenFresh(bundle.expiresAt ?? connection.oauthExpiresAt?.toISOString() ?? null)) {
      return ok({
        accessToken: bundle.accessToken,
        baseUrl: connection.baseUrl,
        connectionId: connection.id,
      });
    }

    if (!bundle.refreshToken) {
      return err({ code: "gitlab_refresh_token_missing" });
    }

    const refreshed = await refreshGitlabAccessToken({
      refreshToken: bundle.refreshToken,
      baseUrl: connection.baseUrl,
    });
    if (!refreshed.ok) {
      const message = "message" in refreshed.error ? refreshed.error.message : refreshed.error.code;
      return err({
        code: "gitlab_token_refresh_failed",
        message,
      });
    }

    const nextBundle: GitlabOAuthTokenBundle = {
      ...refreshed.value,
      refreshToken: refreshed.value.refreshToken ?? bundle.refreshToken,
    };
    const encryptedFields = buildEncryptedGitlabTokenFields(nextBundle);

    await tx
      .update(schema.gitlabConnections)
      .set({
        ...encryptedFields,
        updatedAt: new Date(),
      })
      .where(eq(schema.gitlabConnections.id, connection.id));

    return ok({
      accessToken: nextBundle.accessToken,
      baseUrl: connection.baseUrl,
      connectionId: connection.id,
    });
  });
}
