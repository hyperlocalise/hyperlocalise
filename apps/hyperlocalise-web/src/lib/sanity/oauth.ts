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
import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  webcrypto,
} from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { env } from "@/lib/env";

const ACCESS_TOKEN_PREFIX = "hl_sanity_at_";
const REFRESH_TOKEN_PREFIX = "hl_sanity_rt_";
const DEFAULT_SANITY_REDIRECT_URI = "http://localhost:3000/connect/sanity/oauth/callback";
const ACCESS_TOKEN_LIFETIME_SECONDS = 60 * 60;
const REFRESH_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_CODE_LIFETIME_MS = 10 * 60 * 1000;
const TOKEN_LOOKUP_DIGEST_BYTES = 32;
const TOKEN_LOOKUP_SCRYPT_OPTIONS = {
  N: 16,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
} as const;

export const SANITY_OAUTH_REQUEST_COOKIE = "hl_sanity_oauth_req";
export const SANITY_OAUTH_SCOPE = "sanity";

export type SanityOauthAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  state?: string;
  expiresAt: number;
  nonce: string;
};

export type SanityOauthConnectionRecord = {
  id: string;
  organizationId: string;
  apiKeyId: string;
  enabled: boolean;
};

export type SanityOauthConsentConnection = {
  connectionId: string;
  displayName: string;
  enabled: boolean;
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  role: OrganizationMembershipRole;
};

const SANITY_OAUTH_HANDOFF_LIFETIME_MS = 10 * 60 * 1000;

export type SanityOauthHandoffReadResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "done"; code?: string; error?: string; errorDescription?: string };

function getOauthSecret(): Buffer {
  const decoded = Buffer.from(env.PROVIDER_CREDENTIALS_MASTER_KEY, "base64");
  if (decoded.length === 32) {
    return decoded;
  }

  return createHash("sha256").update(env.PROVIDER_CREDENTIALS_MASTER_KEY).digest();
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string): string {
  // HMAC over the OAuth request cookie payload (PKCE metadata), not a user password.
  return createHmac("sha256", getOauthSecret()).update(value).digest("base64url"); // codeql[js/insufficient-password-hash]
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function randomCredentialBytes(size: number): string {
  return Buffer.from(webcrypto.getRandomValues(new Uint8Array(size))).toString("base64url");
}

/** Keyed lookup digest for 256-bit random OAuth codes and tokens, not user passwords. */
export function digestSanityOauthToken(value: string): string {
  return scryptSync(
    value,
    getOauthSecret(),
    TOKEN_LOOKUP_DIGEST_BYTES,
    TOKEN_LOOKUP_SCRYPT_OPTIONS,
  ).toString("hex");
}

export function generateSanityOauthAccessToken(): string {
  return `${ACCESS_TOKEN_PREFIX}${randomCredentialBytes(32)}`;
}

export function generateSanityOauthRefreshToken(): string {
  return `${REFRESH_TOKEN_PREFIX}${randomCredentialBytes(32)}`;
}

export function generateSanityOauthAuthorizationCode(): string {
  return randomCredentialBytes(32);
}

export function verifyPkceChallenge(input: {
  codeVerifier: string;
  codeChallenge: string;
}): boolean {
  const expectedChallenge = createHash("sha256").update(input.codeVerifier).digest("base64url");
  return constantTimeEqual(expectedChallenge, input.codeChallenge);
}

export function isSanityOauthConfigured(): boolean {
  return Boolean(env.SANITY_OAUTH_CLIENT_ID);
}

export function getSanityOauthRedirectAllowlist(): string[] {
  const configured =
    env.SANITY_OAUTH_REDIRECT_URI?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];

  const redirects = new Set(configured.length > 0 ? configured : [DEFAULT_SANITY_REDIRECT_URI]);

  const publicAppUrl = env.HYPERLOCALISE_PUBLIC_APP_URL?.trim();
  if (publicAppUrl) {
    redirects.add(new URL("/connect/sanity/oauth/callback", publicAppUrl).href);
  }

  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    redirects.add(DEFAULT_SANITY_REDIRECT_URI);
  }

  return [...redirects];
}

export function isAllowedSanityOauthRedirectUri(redirectUri: string): boolean {
  return getSanityOauthRedirectAllowlist().includes(redirectUri);
}

export function createSanityOauthAuthorizationRequest(
  payload: Omit<SanityOauthAuthorizationRequest, "expiresAt" | "nonce">,
): string {
  const fullPayload: SanityOauthAuthorizationRequest = {
    ...payload,
    expiresAt: Date.now() + 15 * 60 * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = base64Url(JSON.stringify(fullPayload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parseSanityOauthAuthorizationRequest(
  token: string,
): SanityOauthAuthorizationRequest | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !constantTimeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  let payload: SanityOauthAuthorizationRequest;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.expiresAt < Date.now()) {
    return null;
  }

  return payload;
}

export function authenticateSanityOauthClient(input: {
  authorizationHeader?: string;
  clientId?: string;
  clientSecret?: string;
}): boolean {
  const expectedClientId = env.SANITY_OAUTH_CLIENT_ID;
  if (!expectedClientId) {
    return false;
  }

  let headerClientId: string | undefined;
  if (input.authorizationHeader?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(input.authorizationHeader.slice("Basic ".length), "base64")
        .toString("utf8")
        .split(":");
      headerClientId = decoded[0];
    } catch {
      return false;
    }
  }

  const clientId = headerClientId ?? input.clientId;
  if (!clientId) {
    return false;
  }

  return constantTimeEqual(clientId, expectedClientId);
}

export async function createSanityOauthAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  organizationId: string;
  connectionId: string;
}): Promise<string> {
  const code = generateSanityOauthAuthorizationCode();
  await db.insert(schema.sanityOauthAuthorizationCodes).values({
    codeHash: digestSanityOauthToken(code),
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: "S256",
    userId: input.userId,
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_LIFETIME_MS),
  });
  return code;
}

export async function consumeSanityOauthAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const [row] = await db
    .select()
    .from(schema.sanityOauthAuthorizationCodes)
    .where(eq(schema.sanityOauthAuthorizationCodes.codeHash, digestSanityOauthToken(input.code)))
    .limit(1);

  if (
    !row ||
    row.consumedAt ||
    row.expiresAt.getTime() < Date.now() ||
    row.clientId !== input.clientId ||
    row.redirectUri !== input.redirectUri ||
    !verifyPkceChallenge({
      codeVerifier: input.codeVerifier,
      codeChallenge: row.codeChallenge,
    })
  ) {
    return null;
  }

  const [consumed] = await db
    .update(schema.sanityOauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.sanityOauthAuthorizationCodes.id, row.id),
        isNull(schema.sanityOauthAuthorizationCodes.consumedAt),
      ),
    )
    .returning({ id: schema.sanityOauthAuthorizationCodes.id });

  if (!consumed) {
    return null;
  }

  return row;
}

export async function issueSanityOauthTokens(input: {
  connectionId: string;
  userId: string;
  organizationId: string;
}) {
  const accessToken = generateSanityOauthAccessToken();
  const refreshToken = generateSanityOauthRefreshToken();
  const now = Date.now();

  await db.insert(schema.sanityOauthTokens).values({
    connectionId: input.connectionId,
    userId: input.userId,
    organizationId: input.organizationId,
    accessTokenHash: digestSanityOauthToken(accessToken),
    refreshTokenHash: digestSanityOauthToken(refreshToken),
    accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_LIFETIME_SECONDS * 1000),
    refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_LIFETIME_MS),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
    scope: SANITY_OAUTH_SCOPE,
  };
}

export async function refreshSanityOauthTokens(refreshToken: string) {
  const refreshTokenHash = digestSanityOauthToken(refreshToken);
  const [row] = await db
    .select()
    .from(schema.sanityOauthTokens)
    .where(eq(schema.sanityOauthTokens.refreshTokenHash, refreshTokenHash))
    .limit(1);

  if (!row || row.revokedAt || row.refreshTokenExpiresAt.getTime() < Date.now()) {
    return null;
  }

  const accessToken = generateSanityOauthAccessToken();
  const nextRefreshToken = generateSanityOauthRefreshToken();
  const now = Date.now();

  const [updated] = await db
    .update(schema.sanityOauthTokens)
    .set({
      accessTokenHash: digestSanityOauthToken(accessToken),
      refreshTokenHash: digestSanityOauthToken(nextRefreshToken),
      accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_LIFETIME_SECONDS * 1000),
      refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_LIFETIME_MS),
      revokedAt: null,
    })
    .where(
      and(
        eq(schema.sanityOauthTokens.id, row.id),
        eq(schema.sanityOauthTokens.refreshTokenHash, refreshTokenHash),
        isNull(schema.sanityOauthTokens.revokedAt),
      ),
    )
    .returning({ id: schema.sanityOauthTokens.id });

  if (!updated) {
    return null;
  }

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
    scope: SANITY_OAUTH_SCOPE,
  };
}

export async function revokeSanityOauthToken(token: string): Promise<boolean> {
  const tokenHash = digestSanityOauthToken(token);
  const [byAccess] = await db
    .update(schema.sanityOauthTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.sanityOauthTokens.accessTokenHash, tokenHash),
        isNull(schema.sanityOauthTokens.revokedAt),
      ),
    )
    .returning({ id: schema.sanityOauthTokens.id });

  if (byAccess) {
    return true;
  }

  const [byRefresh] = await db
    .update(schema.sanityOauthTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.sanityOauthTokens.refreshTokenHash, tokenHash),
        isNull(schema.sanityOauthTokens.revokedAt),
      ),
    )
    .returning({ id: schema.sanityOauthTokens.id });

  return Boolean(byRefresh);
}

export async function getSanityConnectionByOauthAccessToken(
  accessToken: string,
): Promise<SanityOauthConnectionRecord | null> {
  const [row] = await db
    .select({
      id: schema.sanityConnections.id,
      organizationId: schema.sanityConnections.organizationId,
      apiKeyId: schema.sanityConnections.apiKeyId,
      enabled: schema.sanityConnections.enabled,
      revokedAt: schema.sanityOauthTokens.revokedAt,
      accessTokenExpiresAt: schema.sanityOauthTokens.accessTokenExpiresAt,
    })
    .from(schema.sanityOauthTokens)
    .innerJoin(
      schema.sanityConnections,
      eq(schema.sanityOauthTokens.connectionId, schema.sanityConnections.id),
    )
    .where(
      and(
        eq(schema.sanityOauthTokens.accessTokenHash, digestSanityOauthToken(accessToken)),
        isNull(schema.sanityOauthTokens.revokedAt),
        gt(schema.sanityOauthTokens.accessTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organizationId,
    apiKeyId: row.apiKeyId,
    enabled: row.enabled,
  };
}

function generateSanityOauthHandoffKey(): string {
  return randomCredentialBytes(32);
}

export async function createSanityOauthHandoff(): Promise<{ readKey: string; writeKey: string }> {
  const readKey = generateSanityOauthHandoffKey();
  const writeKey = generateSanityOauthHandoffKey();
  await db.insert(schema.sanityOauthHandoffs).values({
    readKeyHash: digestSanityOauthToken(readKey),
    writeKeyHash: digestSanityOauthToken(writeKey),
    expiresAt: new Date(Date.now() + SANITY_OAUTH_HANDOFF_LIFETIME_MS),
  });
  return { readKey, writeKey };
}

export async function completeSanityOauthHandoff(input: {
  writeKey: string;
  code?: string;
  error?: string;
  errorDescription?: string;
}): Promise<boolean> {
  const writeKeyHash = digestSanityOauthToken(input.writeKey);
  const [updated] = await db
    .update(schema.sanityOauthHandoffs)
    .set({
      code: input.code ?? null,
      error: input.error ?? null,
      errorDescription: input.errorDescription ?? null,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.sanityOauthHandoffs.writeKeyHash, writeKeyHash),
        isNull(schema.sanityOauthHandoffs.completedAt),
        gt(schema.sanityOauthHandoffs.expiresAt, new Date()),
      ),
    )
    .returning({ id: schema.sanityOauthHandoffs.id });

  return Boolean(updated);
}

export async function readSanityOauthHandoff(
  readKey: string,
): Promise<SanityOauthHandoffReadResult> {
  const readKeyHash = digestSanityOauthToken(readKey);
  const [row] = await db
    .select()
    .from(schema.sanityOauthHandoffs)
    .where(eq(schema.sanityOauthHandoffs.readKeyHash, readKeyHash))
    .limit(1);

  if (!row) {
    return { status: "expired" };
  }

  if (row.expiresAt.getTime() < Date.now()) {
    return { status: "expired" };
  }

  if (!row.completedAt) {
    return { status: "pending" };
  }

  const [consumed] = await db
    .update(schema.sanityOauthHandoffs)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(schema.sanityOauthHandoffs.id, row.id), isNull(schema.sanityOauthHandoffs.consumedAt)),
    )
    .returning({
      code: schema.sanityOauthHandoffs.code,
      error: schema.sanityOauthHandoffs.error,
      errorDescription: schema.sanityOauthHandoffs.errorDescription,
    });

  if (!consumed) {
    return { status: "expired" };
  }

  return {
    status: "done",
    code: consumed.code ?? undefined,
    error: consumed.error ?? undefined,
    errorDescription: consumed.errorDescription ?? undefined,
  };
}

export async function listSanityOauthConsentConnections(
  userId: string,
): Promise<SanityOauthConsentConnection[]> {
  const rows = await db
    .select({
      connectionId: schema.sanityConnections.id,
      displayName: schema.sanityConnections.displayName,
      enabled: schema.sanityConnections.enabled,
      organizationId: schema.organizations.id,
      organizationName: schema.organizations.name,
      organizationSlug: schema.organizations.slug,
      role: schema.organizationMemberships.role,
    })
    .from(schema.organizationMemberships)
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .innerJoin(
      schema.sanityConnections,
      eq(schema.sanityConnections.organizationId, schema.organizations.id),
    )
    .where(eq(schema.organizationMemberships.userId, userId));

  return rows;
}

export function buildSanityOauthRedirect(input: {
  redirectUri: string;
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}): string {
  const redirectUrl = new URL(input.redirectUri);
  if (input.error) {
    redirectUrl.searchParams.set("error", input.error);
    if (input.errorDescription) {
      redirectUrl.searchParams.set("error_description", input.errorDescription);
    }
  } else if (input.code) {
    redirectUrl.searchParams.set("code", input.code);
  }

  if (input.state) {
    redirectUrl.searchParams.set("state", input.state);
  }

  return redirectUrl.toString();
}
