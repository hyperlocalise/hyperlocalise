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
import { env } from "@/lib/env";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import {
  GSC_GOOGLE_TOKEN_URL,
  GSC_GOOGLE_USERINFO_URL,
  GSC_OAUTH_SCOPES,
} from "./constants";
import type { GscConnectionError, GscConnectionSummary } from "./types";

type GscConnectionRow = typeof schema.gscConnections.$inferSelect;

const ACCESS_TOKEN_SKEW_MS = 60_000;

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
};

function serializeConnection(row: GscConnectionRow): GscConnectionSummary {
  return {
    id: row.id,
    organizationId: row.organizationId,
    accountEmail: row.accountEmail,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function encryptSecret(secret: string) {
  return unwrapProviderCredentialCrypto(encryptProviderCredential(secret));
}

function decryptSecret(input: {
  algorithm: string;
  keyVersion: number;
  ciphertext: string;
  iv: string;
  authTag: string;
}): Result<string, GscConnectionError> {
  const decrypted = decryptProviderCredential({
    algorithm: input.algorithm,
    keyVersion: input.keyVersion,
    ciphertext: input.ciphertext,
    iv: input.iv,
    authTag: input.authTag,
  });
  if (isErr(decrypted) || !decrypted.value.trim()) {
    return err({
      code: "gsc_connection_decrypt_failed",
      message: "Unable to decrypt Search Console credentials.",
    });
  }
  return ok(decrypted.value.trim());
}

export function isGscOAuthConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export async function listGscConnections(input: {
  organizationId: string;
}): Promise<GscConnectionSummary[]> {
  const rows = await db
    .select()
    .from(schema.gscConnections)
    .where(eq(schema.gscConnections.organizationId, input.organizationId));
  return rows.map(serializeConnection);
}

export async function getGscConnection(input: {
  organizationId: string;
}): Promise<GscConnectionSummary | null> {
  const [row] = await db
    .select()
    .from(schema.gscConnections)
    .where(eq(schema.gscConnections.organizationId, input.organizationId))
    .limit(1);
  return row ? serializeConnection(row) : null;
}

export async function deleteGscConnection(input: {
  organizationId: string;
}): Promise<boolean> {
  const deleted = await db
    .delete(schema.gscConnections)
    .where(eq(schema.gscConnections.organizationId, input.organizationId))
    .returning({ id: schema.gscConnections.id });
  return deleted.length > 0;
}

export async function exchangeGscAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  signal?: AbortSignal;
}): Promise<Result<{ accessToken: string; refreshToken: string; expiresAt: Date; scopes: string }, GscConnectionError>> {
  if (!isGscOAuthConfigured()) {
    return err({
      code: "gsc_not_configured",
      message: "Search Console OAuth is not configured.",
    });
  }

  const response = await fetch(GSC_GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: input.signal,
  });
  const body = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok || !body.access_token) {
    return err({
      code: "gsc_oauth_exchange_failed",
      message: body.error_description || body.error || "Google did not return an access token.",
    });
  }
  if (!body.refresh_token) {
    return err({
      code: "gsc_oauth_exchange_failed",
      message: "Google did not return a refresh token. Reconnect Search Console and grant offline access.",
    });
  }

  return ok({
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + Math.max(body.expires_in ?? 3600, 60) * 1000),
    scopes: body.scope || GSC_OAUTH_SCOPES.join(" "),
  });
}

export async function fetchGscAccount(input: {
  accessToken: string;
  signal?: AbortSignal;
}): Promise<Result<{ googleSubject: string; accountEmail: string }, GscConnectionError>> {
  const response = await fetch(GSC_GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
    signal: input.signal,
  });
  const body = (await response.json().catch(() => ({}))) as GoogleUserInfo;
  const email = body.email?.trim();
  const subject = body.sub?.trim();
  if (!response.ok || !email || !subject) {
    return err({
      code: "gsc_oauth_invalid",
      message: "Google did not return the connected account email.",
    });
  }
  return ok({ googleSubject: subject, accountEmail: email });
}

export async function upsertGscConnection(input: {
  organizationId: string;
  userId: string;
  googleSubject: string;
  accountEmail: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  scopes: string;
}): Promise<GscConnectionSummary> {
  const refresh = encryptSecret(input.refreshToken);
  const access = encryptSecret(input.accessToken);
  const [row] = await db
    .insert(schema.gscConnections)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      googleSubject: input.googleSubject,
      accountEmail: input.accountEmail,
      scopes: input.scopes,
      encryptionAlgorithm: refresh.algorithm,
      ciphertext: refresh.ciphertext,
      iv: refresh.iv,
      authTag: refresh.authTag,
      keyVersion: refresh.keyVersion,
      accessTokenEncryptionAlgorithm: access.algorithm,
      accessTokenCiphertext: access.ciphertext,
      accessTokenIv: access.iv,
      accessTokenAuthTag: access.authTag,
      accessTokenKeyVersion: access.keyVersion,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
    })
    .onConflictDoUpdate({
      target: schema.gscConnections.organizationId,
      set: {
        updatedByUserId: input.userId,
        googleSubject: input.googleSubject,
        accountEmail: input.accountEmail,
        scopes: input.scopes,
        encryptionAlgorithm: refresh.algorithm,
        ciphertext: refresh.ciphertext,
        iv: refresh.iv,
        authTag: refresh.authTag,
        keyVersion: refresh.keyVersion,
        accessTokenEncryptionAlgorithm: access.algorithm,
        accessTokenCiphertext: access.ciphertext,
        accessTokenIv: access.iv,
        accessTokenAuthTag: access.authTag,
        accessTokenKeyVersion: access.keyVersion,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    throw new Error("gsc_connection_upsert_failed");
  }
  return serializeConnection(row);
}

async function refreshGscAccessToken(input: {
  refreshToken: string;
  signal?: AbortSignal;
}): Promise<Result<{ accessToken: string; expiresAt: Date; refreshToken?: string }, GscConnectionError>> {
  if (!isGscOAuthConfigured()) {
    return err({
      code: "gsc_not_configured",
      message: "Search Console OAuth is not configured.",
    });
  }

  const response = await fetch(GSC_GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: input.refreshToken,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
    signal: input.signal,
  });
  const body = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok || !body.access_token) {
    return err({
      code: "gsc_refresh_failed",
      message: body.error_description || body.error || "Search Console refresh token was rejected.",
    });
  }

  return ok({
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + Math.max(body.expires_in ?? 3600, 60) * 1000),
    refreshToken: body.refresh_token,
  });
}

export async function mintGscAccessToken(input: {
  organizationId: string;
  signal?: AbortSignal;
}): Promise<Result<{ connection: GscConnectionSummary; accessToken: string }, GscConnectionError>> {
  const [row] = await db
    .select()
    .from(schema.gscConnections)
    .where(eq(schema.gscConnections.organizationId, input.organizationId))
    .limit(1);

  if (!row) {
    return err({
      code: "gsc_connection_not_found",
      message: "Connect Search Console to view Google performance for this domain.",
    });
  }

  if (
    row.accessTokenCiphertext &&
    row.accessTokenEncryptionAlgorithm &&
    row.accessTokenIv &&
    row.accessTokenAuthTag &&
    row.accessTokenKeyVersion != null &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() - ACCESS_TOKEN_SKEW_MS > Date.now()
  ) {
    const cached = decryptSecret({
      algorithm: row.accessTokenEncryptionAlgorithm,
      keyVersion: row.accessTokenKeyVersion,
      ciphertext: row.accessTokenCiphertext,
      iv: row.accessTokenIv,
      authTag: row.accessTokenAuthTag,
    });
    if (cached.ok) {
      return ok({ connection: serializeConnection(row), accessToken: cached.value });
    }
  }

  const refreshToken = decryptSecret({
    algorithm: row.encryptionAlgorithm,
    keyVersion: row.keyVersion,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  if (isErr(refreshToken)) {
    return refreshToken;
  }

  const refreshed = await refreshGscAccessToken({
    refreshToken: refreshToken.value,
    signal: input.signal,
  });
  if (isErr(refreshed)) {
    return refreshed;
  }

  const access = encryptSecret(refreshed.value.accessToken);
  const nextRefresh = refreshed.value.refreshToken
    ? encryptSecret(refreshed.value.refreshToken)
    : null;
  await db
    .update(schema.gscConnections)
    .set({
      ...(nextRefresh
        ? {
            encryptionAlgorithm: nextRefresh.algorithm,
            ciphertext: nextRefresh.ciphertext,
            iv: nextRefresh.iv,
            authTag: nextRefresh.authTag,
            keyVersion: nextRefresh.keyVersion,
          }
        : {}),
      accessTokenEncryptionAlgorithm: access.algorithm,
      accessTokenCiphertext: access.ciphertext,
      accessTokenIv: access.iv,
      accessTokenAuthTag: access.authTag,
      accessTokenKeyVersion: access.keyVersion,
      accessTokenExpiresAt: refreshed.value.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.gscConnections.id, row.id));

  return ok({
    connection: serializeConnection(row),
    accessToken: refreshed.value.accessToken,
  });
}
