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

const ACCESS_TOKEN_PREFIX = "hl_canva_at_";
const REFRESH_TOKEN_PREFIX = "hl_canva_rt_";
const DEFAULT_CANVA_REDIRECT_URI = "https://www.canva.com/apps/oauth/authorized";
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

export const CANVA_OAUTH_REQUEST_COOKIE = "hl_canva_oauth_req";
export const CANVA_OAUTH_SCOPE = "canva";

export type CanvaOauthAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  state?: string;
  expiresAt: number;
  nonce: string;
};

export type CanvaOauthConnectionRecord = {
  id: string;
  organizationId: string;
  apiKeyId: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  canvaBrandId: string | null;
  enabled: boolean;
};

export type CanvaOauthConsentConnection = {
  connectionId: string;
  displayName: string;
  enabled: boolean;
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  projectId: string;
  projectName: string;
  role: OrganizationMembershipRole;
};

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
  return createHmac("sha256", getOauthSecret()).update(value).digest("base64url");
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
export function digestCanvaOauthToken(value: string): string {
  return scryptSync(
    value,
    getOauthSecret(),
    TOKEN_LOOKUP_DIGEST_BYTES,
    TOKEN_LOOKUP_SCRYPT_OPTIONS,
  ).toString("hex");
}

export function generateCanvaOauthAccessToken(): string {
  return `${ACCESS_TOKEN_PREFIX}${randomCredentialBytes(32)}`;
}

export function generateCanvaOauthRefreshToken(): string {
  return `${REFRESH_TOKEN_PREFIX}${randomCredentialBytes(32)}`;
}

export function generateCanvaOauthAuthorizationCode(): string {
  return randomCredentialBytes(32);
}

export function verifyPkceChallenge(input: {
  codeVerifier: string;
  codeChallenge: string;
}): boolean {
  const expectedChallenge = createHash("sha256").update(input.codeVerifier).digest("base64url");
  return constantTimeEqual(expectedChallenge, input.codeChallenge);
}

export function isCanvaOauthConfigured(): boolean {
  return Boolean(env.CANVA_OAUTH_CLIENT_ID && env.CANVA_OAUTH_CLIENT_SECRET);
}

export function getCanvaOauthRedirectAllowlist(): string[] {
  const configured =
    env.CANVA_OAUTH_REDIRECT_URI?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];

  const redirects = new Set(configured.length > 0 ? configured : [DEFAULT_CANVA_REDIRECT_URI]);

  if (env.NODE_ENV === "development") {
    redirects.add("http://localhost:3000/oauth/callback");
    redirects.add("https://www.canva.com/apps/oauth/authorized");
  }

  return [...redirects];
}

export function isAllowedCanvaOauthRedirectUri(redirectUri: string): boolean {
  return getCanvaOauthRedirectAllowlist().includes(redirectUri);
}

export function createCanvaOauthAuthorizationRequest(
  payload: Omit<CanvaOauthAuthorizationRequest, "expiresAt" | "nonce">,
): string {
  const fullPayload: CanvaOauthAuthorizationRequest = {
    ...payload,
    expiresAt: Date.now() + 15 * 60 * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = base64Url(JSON.stringify(fullPayload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parseCanvaOauthAuthorizationRequest(
  token: string,
): CanvaOauthAuthorizationRequest | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !constantTimeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  let payload: CanvaOauthAuthorizationRequest;
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

export function authenticateCanvaOauthClient(input: {
  authorizationHeader?: string;
  clientId?: string;
  clientSecret?: string;
}): boolean {
  const expectedClientId = env.CANVA_OAUTH_CLIENT_ID;
  const expectedClientSecret = env.CANVA_OAUTH_CLIENT_SECRET;
  if (!expectedClientId || !expectedClientSecret) {
    return false;
  }

  let headerClientId: string | undefined;
  let headerClientSecret: string | undefined;
  if (input.authorizationHeader?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(input.authorizationHeader.slice("Basic ".length), "base64")
        .toString("utf8")
        .split(":");
      headerClientId = decoded[0];
      headerClientSecret = decoded.slice(1).join(":");
    } catch {
      return false;
    }
  }

  const clientId = headerClientId ?? input.clientId;
  const clientSecret = headerClientSecret ?? input.clientSecret;
  if (!clientId || !clientSecret) {
    return false;
  }

  return (
    constantTimeEqual(clientId, expectedClientId) &&
    constantTimeEqual(clientSecret, expectedClientSecret)
  );
}

export async function createCanvaOauthAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  organizationId: string;
  connectionId: string;
}): Promise<string> {
  const code = generateCanvaOauthAuthorizationCode();
  await db.insert(schema.canvaOauthAuthorizationCodes).values({
    codeHash: digestCanvaOauthToken(code),
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

export async function consumeCanvaOauthAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const [row] = await db
    .select()
    .from(schema.canvaOauthAuthorizationCodes)
    .where(eq(schema.canvaOauthAuthorizationCodes.codeHash, digestCanvaOauthToken(input.code)))
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
    .update(schema.canvaOauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.canvaOauthAuthorizationCodes.id, row.id),
        isNull(schema.canvaOauthAuthorizationCodes.consumedAt),
      ),
    )
    .returning({ id: schema.canvaOauthAuthorizationCodes.id });

  if (!consumed) {
    return null;
  }

  return row;
}

export async function issueCanvaOauthTokens(input: {
  connectionId: string;
  userId: string;
  organizationId: string;
}) {
  const accessToken = generateCanvaOauthAccessToken();
  const refreshToken = generateCanvaOauthRefreshToken();
  const now = Date.now();

  await db.insert(schema.canvaOauthTokens).values({
    connectionId: input.connectionId,
    userId: input.userId,
    organizationId: input.organizationId,
    accessTokenHash: digestCanvaOauthToken(accessToken),
    refreshTokenHash: digestCanvaOauthToken(refreshToken),
    accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_LIFETIME_SECONDS * 1000),
    refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_LIFETIME_MS),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
    scope: CANVA_OAUTH_SCOPE,
  };
}

export async function refreshCanvaOauthTokens(refreshToken: string) {
  const [row] = await db
    .select()
    .from(schema.canvaOauthTokens)
    .where(eq(schema.canvaOauthTokens.refreshTokenHash, digestCanvaOauthToken(refreshToken)))
    .limit(1);

  if (!row || row.revokedAt || row.refreshTokenExpiresAt.getTime() < Date.now()) {
    return null;
  }

  const accessToken = generateCanvaOauthAccessToken();
  const nextRefreshToken = generateCanvaOauthRefreshToken();
  const now = Date.now();

  const [updated] = await db
    .update(schema.canvaOauthTokens)
    .set({
      accessTokenHash: digestCanvaOauthToken(accessToken),
      refreshTokenHash: digestCanvaOauthToken(nextRefreshToken),
      accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_LIFETIME_SECONDS * 1000),
      refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_LIFETIME_MS),
      revokedAt: null,
    })
    .where(and(eq(schema.canvaOauthTokens.id, row.id), isNull(schema.canvaOauthTokens.revokedAt)))
    .returning({ id: schema.canvaOauthTokens.id });

  if (!updated) {
    return null;
  }

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
    scope: CANVA_OAUTH_SCOPE,
  };
}

export async function revokeCanvaOauthToken(token: string): Promise<boolean> {
  const tokenHash = digestCanvaOauthToken(token);
  const [byAccess] = await db
    .update(schema.canvaOauthTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.canvaOauthTokens.accessTokenHash, tokenHash),
        isNull(schema.canvaOauthTokens.revokedAt),
      ),
    )
    .returning({ id: schema.canvaOauthTokens.id });

  if (byAccess) {
    return true;
  }

  const [byRefresh] = await db
    .update(schema.canvaOauthTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.canvaOauthTokens.refreshTokenHash, tokenHash),
        isNull(schema.canvaOauthTokens.revokedAt),
      ),
    )
    .returning({ id: schema.canvaOauthTokens.id });

  return Boolean(byRefresh);
}

export async function getCanvaConnectionByOauthAccessToken(
  accessToken: string,
): Promise<CanvaOauthConnectionRecord | null> {
  const [row] = await db
    .select({
      id: schema.canvaConnections.id,
      organizationId: schema.canvaConnections.organizationId,
      apiKeyId: schema.canvaConnections.apiKeyId,
      projectId: schema.canvaConnections.projectId,
      sourceLocale: schema.canvaConnections.sourceLocale,
      targetLocales: schema.canvaConnections.targetLocales,
      canvaBrandId: schema.canvaConnections.canvaBrandId,
      enabled: schema.canvaConnections.enabled,
      revokedAt: schema.canvaOauthTokens.revokedAt,
      accessTokenExpiresAt: schema.canvaOauthTokens.accessTokenExpiresAt,
    })
    .from(schema.canvaOauthTokens)
    .innerJoin(
      schema.canvaConnections,
      eq(schema.canvaOauthTokens.connectionId, schema.canvaConnections.id),
    )
    .where(
      and(
        eq(schema.canvaOauthTokens.accessTokenHash, digestCanvaOauthToken(accessToken)),
        isNull(schema.canvaOauthTokens.revokedAt),
        gt(schema.canvaOauthTokens.accessTokenExpiresAt, new Date()),
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
    projectId: row.projectId,
    sourceLocale: row.sourceLocale,
    targetLocales: row.targetLocales ?? [],
    canvaBrandId: row.canvaBrandId,
    enabled: row.enabled,
  };
}

export async function listCanvaOauthConsentConnections(
  userId: string,
): Promise<CanvaOauthConsentConnection[]> {
  const rows = await db
    .select({
      connectionId: schema.canvaConnections.id,
      displayName: schema.canvaConnections.displayName,
      enabled: schema.canvaConnections.enabled,
      organizationId: schema.organizations.id,
      organizationName: schema.organizations.name,
      organizationSlug: schema.organizations.slug,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      role: schema.organizationMemberships.role,
    })
    .from(schema.organizationMemberships)
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .innerJoin(
      schema.canvaConnections,
      eq(schema.canvaConnections.organizationId, schema.organizations.id),
    )
    .innerJoin(schema.projects, eq(schema.canvaConnections.projectId, schema.projects.id))
    .where(eq(schema.organizationMemberships.userId, userId));

  return rows;
}

export function buildCanvaOauthRedirect(input: {
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
