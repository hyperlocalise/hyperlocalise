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

const ACCESS_TOKEN_PREFIX = "hl_figma_at_";
const REFRESH_TOKEN_PREFIX = "hl_figma_rt_";
const DEFAULT_FIGMA_REDIRECT_URI = "https://www.figma.com/apps/oauth/authorized";
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

export const FIGMA_OAUTH_REQUEST_COOKIE = "hl_figma_oauth_req";
export const FIGMA_OAUTH_SCOPE = "figma";

export type FigmaOauthAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  state?: string;
  expiresAt: number;
  nonce: string;
};

export type FigmaOauthConnectionRecord = {
  id: string;
  organizationId: string;
  apiKeyId: string;
  enabled: boolean;
};

export type FigmaOauthConsentConnection = {
  connectionId: string;
  displayName: string;
  enabled: boolean;
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  role: OrganizationMembershipRole;
};

const FIGMA_OAUTH_HANDOFF_LIFETIME_MS = 10 * 60 * 1000;

export type FigmaOauthHandoffReadResult =
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
export function digestFigmaOauthToken(value: string): string {
  return scryptSync(
    value,
    getOauthSecret(),
    TOKEN_LOOKUP_DIGEST_BYTES,
    TOKEN_LOOKUP_SCRYPT_OPTIONS,
  ).toString("hex");
}

export function generateFigmaOauthAccessToken(): string {
  return `${ACCESS_TOKEN_PREFIX}${randomCredentialBytes(32)}`;
}

export function generateFigmaOauthRefreshToken(): string {
  return `${REFRESH_TOKEN_PREFIX}${randomCredentialBytes(32)}`;
}

export function generateFigmaOauthAuthorizationCode(): string {
  return randomCredentialBytes(32);
}

export function verifyPkceChallenge(input: {
  codeVerifier: string;
  codeChallenge: string;
}): boolean {
  const expectedChallenge = createHash("sha256").update(input.codeVerifier).digest("base64url");
  return constantTimeEqual(expectedChallenge, input.codeChallenge);
}

export function isFigmaOauthConfigured(): boolean {
  return Boolean(env.FIGMA_OAUTH_CLIENT_ID);
}

export function getFigmaOauthRedirectAllowlist(): string[] {
  const configured =
    env.FIGMA_OAUTH_REDIRECT_URI?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];

  const redirects = new Set(configured.length > 0 ? configured : [DEFAULT_FIGMA_REDIRECT_URI]);

  const publicAppUrl = env.HYPERLOCALISE_PUBLIC_APP_URL?.trim();
  if (publicAppUrl) {
    redirects.add(new URL("/connect/figma/oauth/callback", publicAppUrl).href);
  }

  if (env.NODE_ENV === "development") {
    redirects.add("http://localhost:3000/connect/figma/oauth/callback");
    redirects.add("figma://oauth/callback");
  }

  return [...redirects];
}

export function isAllowedFigmaOauthRedirectUri(redirectUri: string): boolean {
  return getFigmaOauthRedirectAllowlist().includes(redirectUri);
}

export function createFigmaOauthAuthorizationRequest(
  payload: Omit<FigmaOauthAuthorizationRequest, "expiresAt" | "nonce">,
): string {
  const fullPayload: FigmaOauthAuthorizationRequest = {
    ...payload,
    expiresAt: Date.now() + 15 * 60 * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = base64Url(JSON.stringify(fullPayload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parseFigmaOauthAuthorizationRequest(
  token: string,
): FigmaOauthAuthorizationRequest | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !constantTimeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  let payload: FigmaOauthAuthorizationRequest;
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

export function authenticateFigmaOauthClient(input: {
  authorizationHeader?: string;
  clientId?: string;
  clientSecret?: string;
}): boolean {
  const expectedClientId = env.FIGMA_OAUTH_CLIENT_ID;
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

export async function createFigmaOauthAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  organizationId: string;
  connectionId: string;
}): Promise<string> {
  const code = generateFigmaOauthAuthorizationCode();
  await db.insert(schema.figmaOauthAuthorizationCodes).values({
    codeHash: digestFigmaOauthToken(code),
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

export async function consumeFigmaOauthAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const [row] = await db
    .select()
    .from(schema.figmaOauthAuthorizationCodes)
    .where(eq(schema.figmaOauthAuthorizationCodes.codeHash, digestFigmaOauthToken(input.code)))
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
    .update(schema.figmaOauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.figmaOauthAuthorizationCodes.id, row.id),
        isNull(schema.figmaOauthAuthorizationCodes.consumedAt),
      ),
    )
    .returning({ id: schema.figmaOauthAuthorizationCodes.id });

  if (!consumed) {
    return null;
  }

  return row;
}

export async function issueFigmaOauthTokens(input: {
  connectionId: string;
  userId: string;
  organizationId: string;
}) {
  const accessToken = generateFigmaOauthAccessToken();
  const refreshToken = generateFigmaOauthRefreshToken();
  const now = Date.now();

  await db.insert(schema.figmaOauthTokens).values({
    connectionId: input.connectionId,
    userId: input.userId,
    organizationId: input.organizationId,
    accessTokenHash: digestFigmaOauthToken(accessToken),
    refreshTokenHash: digestFigmaOauthToken(refreshToken),
    accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_LIFETIME_SECONDS * 1000),
    refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_LIFETIME_MS),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
    scope: FIGMA_OAUTH_SCOPE,
  };
}

export async function refreshFigmaOauthTokens(refreshToken: string) {
  const refreshTokenHash = digestFigmaOauthToken(refreshToken);
  const [row] = await db
    .select()
    .from(schema.figmaOauthTokens)
    .where(eq(schema.figmaOauthTokens.refreshTokenHash, refreshTokenHash))
    .limit(1);

  if (!row || row.revokedAt || row.refreshTokenExpiresAt.getTime() < Date.now()) {
    return null;
  }

  const accessToken = generateFigmaOauthAccessToken();
  const nextRefreshToken = generateFigmaOauthRefreshToken();
  const now = Date.now();

  const [updated] = await db
    .update(schema.figmaOauthTokens)
    .set({
      accessTokenHash: digestFigmaOauthToken(accessToken),
      refreshTokenHash: digestFigmaOauthToken(nextRefreshToken),
      accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_LIFETIME_SECONDS * 1000),
      refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_LIFETIME_MS),
      revokedAt: null,
    })
    .where(
      and(
        eq(schema.figmaOauthTokens.id, row.id),
        eq(schema.figmaOauthTokens.refreshTokenHash, refreshTokenHash),
        isNull(schema.figmaOauthTokens.revokedAt),
      ),
    )
    .returning({ id: schema.figmaOauthTokens.id });

  if (!updated) {
    return null;
  }

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
    scope: FIGMA_OAUTH_SCOPE,
  };
}

export async function revokeFigmaOauthToken(token: string): Promise<boolean> {
  const tokenHash = digestFigmaOauthToken(token);
  const [byAccess] = await db
    .update(schema.figmaOauthTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.figmaOauthTokens.accessTokenHash, tokenHash),
        isNull(schema.figmaOauthTokens.revokedAt),
      ),
    )
    .returning({ id: schema.figmaOauthTokens.id });

  if (byAccess) {
    return true;
  }

  const [byRefresh] = await db
    .update(schema.figmaOauthTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.figmaOauthTokens.refreshTokenHash, tokenHash),
        isNull(schema.figmaOauthTokens.revokedAt),
      ),
    )
    .returning({ id: schema.figmaOauthTokens.id });

  return Boolean(byRefresh);
}

export async function getFigmaConnectionByOauthAccessToken(
  accessToken: string,
): Promise<FigmaOauthConnectionRecord | null> {
  const [row] = await db
    .select({
      id: schema.figmaConnections.id,
      organizationId: schema.figmaConnections.organizationId,
      apiKeyId: schema.figmaConnections.apiKeyId,
      enabled: schema.figmaConnections.enabled,
      revokedAt: schema.figmaOauthTokens.revokedAt,
      accessTokenExpiresAt: schema.figmaOauthTokens.accessTokenExpiresAt,
    })
    .from(schema.figmaOauthTokens)
    .innerJoin(
      schema.figmaConnections,
      eq(schema.figmaOauthTokens.connectionId, schema.figmaConnections.id),
    )
    .where(
      and(
        eq(schema.figmaOauthTokens.accessTokenHash, digestFigmaOauthToken(accessToken)),
        isNull(schema.figmaOauthTokens.revokedAt),
        gt(schema.figmaOauthTokens.accessTokenExpiresAt, new Date()),
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

function generateFigmaOauthHandoffKey(): string {
  return randomCredentialBytes(32);
}

export async function createFigmaOauthHandoff(): Promise<{ readKey: string; writeKey: string }> {
  const readKey = generateFigmaOauthHandoffKey();
  const writeKey = generateFigmaOauthHandoffKey();
  await db.insert(schema.figmaOauthHandoffs).values({
    readKeyHash: digestFigmaOauthToken(readKey),
    writeKeyHash: digestFigmaOauthToken(writeKey),
    expiresAt: new Date(Date.now() + FIGMA_OAUTH_HANDOFF_LIFETIME_MS),
  });
  return { readKey, writeKey };
}

export async function completeFigmaOauthHandoff(input: {
  writeKey: string;
  code?: string;
  error?: string;
  errorDescription?: string;
}): Promise<boolean> {
  const writeKeyHash = digestFigmaOauthToken(input.writeKey);
  const [updated] = await db
    .update(schema.figmaOauthHandoffs)
    .set({
      code: input.code ?? null,
      error: input.error ?? null,
      errorDescription: input.errorDescription ?? null,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.figmaOauthHandoffs.writeKeyHash, writeKeyHash),
        isNull(schema.figmaOauthHandoffs.completedAt),
        gt(schema.figmaOauthHandoffs.expiresAt, new Date()),
      ),
    )
    .returning({ id: schema.figmaOauthHandoffs.id });

  return Boolean(updated);
}

export async function readFigmaOauthHandoff(readKey: string): Promise<FigmaOauthHandoffReadResult> {
  const readKeyHash = digestFigmaOauthToken(readKey);
  const [row] = await db
    .select()
    .from(schema.figmaOauthHandoffs)
    .where(eq(schema.figmaOauthHandoffs.readKeyHash, readKeyHash))
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
    .update(schema.figmaOauthHandoffs)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(schema.figmaOauthHandoffs.id, row.id), isNull(schema.figmaOauthHandoffs.consumedAt)),
    )
    .returning({
      code: schema.figmaOauthHandoffs.code,
      error: schema.figmaOauthHandoffs.error,
      errorDescription: schema.figmaOauthHandoffs.errorDescription,
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

export async function listFigmaOauthConsentConnections(
  userId: string,
): Promise<FigmaOauthConsentConnection[]> {
  const rows = await db
    .select({
      connectionId: schema.figmaConnections.id,
      displayName: schema.figmaConnections.displayName,
      enabled: schema.figmaConnections.enabled,
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
      schema.figmaConnections,
      eq(schema.figmaConnections.organizationId, schema.organizations.id),
    )
    .where(eq(schema.organizationMemberships.userId, userId));

  return rows;
}

export function buildFigmaOauthRedirect(input: {
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
