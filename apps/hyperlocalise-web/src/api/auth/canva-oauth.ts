import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";

import { markAuthorizationCodeUsed, verifyPkceChallenge } from "@/api/auth/mcp";

const TOKEN_PREFIX = "hl_canva_";
const CANVA_OAUTH_SCRYPT_SALT = "hl-canva-oauth-hmac-v1";

export type CanvaAuthorizationCodePayload = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  state?: string;
  userId: string;
  expiresAt: number;
  nonce: string;
};

export type CanvaAuthorizationRequestPayload = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  state?: string;
  expiresAt: number;
  nonce: string;
};

export type CanvaConsentGrantPayload = {
  requestNonce: string;
  userId: string;
  expiresAt: number;
};

export const CANVA_AUTH_REQUEST_COOKIE = "hl_canva_auth_req";
export const CANVA_CONSENT_COOKIE = "hl_canva_consent";

function getCanvaOAuthSecret(): Buffer {
  const configuredKey = env.CANVA_OAUTH_CLIENT_SECRET ?? env.PROVIDER_CREDENTIALS_MASTER_KEY;
  const decoded = Buffer.from(configuredKey, "base64");

  if (decoded.length === 32) {
    return decoded;
  }

  return scryptSync(configuredKey, CANVA_OAUTH_SCRYPT_SALT, 32);
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string): string {
  return createHmac("sha256", getCanvaOAuthSecret()).update(value).digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function createSignedPayload<T extends object>(payload: T): string {
  const encodedPayload = base64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function parseSignedPayload<T extends { expiresAt: number }>(token: string): T | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !constantTimeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  let payload: T;
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

export function generateCanvaOAuthToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashCanvaOAuthToken(token: string): string {
  return scryptSync(token, CANVA_OAUTH_SCRYPT_SALT, 32).toString("hex");
}

export function isCanvaOAuthAccessToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}

export function getCanvaOAuthTokenExpiry() {
  const now = Date.now();

  return {
    accessTokenExpiresAt: new Date(now + env.CANVA_OAUTH_ACCESS_TOKEN_LIFETIME_MINUTES * 60 * 1000),
    refreshTokenExpiresAt: new Date(
      now + env.CANVA_OAUTH_REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
    ),
  };
}

export function createCanvaAuthorizationCode(
  payload: Omit<CanvaAuthorizationCodePayload, "expiresAt" | "nonce">,
) {
  const fullPayload: CanvaAuthorizationCodePayload = {
    ...payload,
    expiresAt: Date.now() + 5 * 60 * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  return createSignedPayload(fullPayload);
}

export function parseCanvaAuthorizationCode(code: string): CanvaAuthorizationCodePayload | null {
  return parseSignedPayload<CanvaAuthorizationCodePayload>(code);
}

export function createCanvaAuthorizationRequest(
  payload: Omit<CanvaAuthorizationRequestPayload, "expiresAt" | "nonce">,
) {
  const fullPayload: CanvaAuthorizationRequestPayload = {
    ...payload,
    expiresAt: Date.now() + 15 * 60 * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  return createSignedPayload(fullPayload);
}

export function parseCanvaAuthorizationRequest(
  token: string,
): CanvaAuthorizationRequestPayload | null {
  return parseSignedPayload<CanvaAuthorizationRequestPayload>(token);
}

export function createCanvaConsentGrant(payload: Omit<CanvaConsentGrantPayload, "expiresAt">) {
  const fullPayload: CanvaConsentGrantPayload = {
    ...payload,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  return createSignedPayload(fullPayload);
}

export function parseCanvaConsentGrant(token: string): CanvaConsentGrantPayload | null {
  return parseSignedPayload<CanvaConsentGrantPayload>(token);
}

export function parseCanvaOAuthRedirectUris(): string[] {
  return (env.CANVA_OAUTH_REDIRECT_URIS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isAllowedCanvaOAuthRedirectUri(redirectUri: string): boolean {
  const allowed = parseCanvaOAuthRedirectUris();
  if (allowed.length === 0) {
    return false;
  }

  return allowed.includes(redirectUri);
}

export function isValidCanvaOAuthClient(clientId: string, clientSecret?: string | null): boolean {
  if (!env.CANVA_OAUTH_CLIENT_ID) {
    return false;
  }

  if (clientId !== env.CANVA_OAUTH_CLIENT_ID) {
    return false;
  }

  if (clientSecret === undefined) {
    return true;
  }

  if (!clientSecret || !env.CANVA_OAUTH_CLIENT_SECRET) {
    return false;
  }

  return constantTimeEqual(clientSecret, env.CANVA_OAUTH_CLIENT_SECRET);
}

export async function exchangeCanvaAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const payload = parseCanvaAuthorizationCode(input.code);

  if (
    !payload ||
    payload.clientId !== input.clientId ||
    payload.redirectUri !== input.redirectUri
  ) {
    return { ok: false as const, error: "invalid_grant" };
  }

  if (
    !verifyPkceChallenge({
      codeVerifier: input.codeVerifier,
      codeChallenge: payload.codeChallenge,
      method: payload.codeChallengeMethod,
    })
  ) {
    return { ok: false as const, error: "invalid_grant" };
  }

  const isFirstCodeUse = await markAuthorizationCodeUsed(input.code, {
    expiresAt: payload.expiresAt,
  });

  if (!isFirstCodeUse) {
    return { ok: false as const, error: "invalid_grant" };
  }

  const accessToken = generateCanvaOAuthToken();
  const refreshToken = generateCanvaOAuthToken();
  const { accessTokenExpiresAt, refreshTokenExpiresAt } = getCanvaOAuthTokenExpiry();

  await db.insert(schema.canvaOauthSessions).values({
    userId: payload.userId,
    scope: payload.scope,
    accessTokenHash: hashCanvaOAuthToken(accessToken),
    refreshTokenHash: hashCanvaOAuthToken(refreshToken),
    expiresAt: accessTokenExpiresAt,
    refreshExpiresAt: refreshTokenExpiresAt,
  });

  return {
    ok: true as const,
    accessToken,
    refreshToken,
    expiresIn: env.CANVA_OAUTH_ACCESS_TOKEN_LIFETIME_MINUTES * 60,
    scope: payload.scope,
  };
}

export async function refreshCanvaOAuthToken(input: { refreshToken: string; clientId: string }) {
  if (!isValidCanvaOAuthClient(input.clientId)) {
    return { ok: false as const, error: "invalid_client" };
  }

  const refreshTokenHash = hashCanvaOAuthToken(input.refreshToken);
  const now = new Date();

  const [session] = await db
    .select()
    .from(schema.canvaOauthSessions)
    .where(
      and(
        eq(schema.canvaOauthSessions.refreshTokenHash, refreshTokenHash),
        isNull(schema.canvaOauthSessions.revokedAt),
        gt(schema.canvaOauthSessions.refreshExpiresAt, now),
      ),
    )
    .limit(1);

  if (!session) {
    return { ok: false as const, error: "invalid_grant" };
  }

  const accessToken = generateCanvaOAuthToken();
  const newRefreshToken = generateCanvaOAuthToken();
  const { accessTokenExpiresAt, refreshTokenExpiresAt } = getCanvaOAuthTokenExpiry();

  const [rotatedSession] = await db
    .update(schema.canvaOauthSessions)
    .set({
      accessTokenHash: hashCanvaOAuthToken(accessToken),
      refreshTokenHash: hashCanvaOAuthToken(newRefreshToken),
      expiresAt: accessTokenExpiresAt,
      refreshExpiresAt: refreshTokenExpiresAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.canvaOauthSessions.id, session.id),
        eq(schema.canvaOauthSessions.refreshTokenHash, refreshTokenHash),
        isNull(schema.canvaOauthSessions.revokedAt),
        gt(schema.canvaOauthSessions.refreshExpiresAt, now),
      ),
    )
    .returning({ id: schema.canvaOauthSessions.id });

  if (!rotatedSession) {
    return { ok: false as const, error: "invalid_grant" };
  }

  return {
    ok: true as const,
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: env.CANVA_OAUTH_ACCESS_TOKEN_LIFETIME_MINUTES * 60,
    scope: session.scope,
  };
}

export async function revokeCanvaOAuthToken(token: string) {
  const tokenHash = hashCanvaOAuthToken(token);
  const now = new Date();

  await db
    .update(schema.canvaOauthSessions)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        isNull(schema.canvaOauthSessions.revokedAt),
        eq(schema.canvaOauthSessions.accessTokenHash, tokenHash),
      ),
    );

  await db
    .update(schema.canvaOauthSessions)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        isNull(schema.canvaOauthSessions.revokedAt),
        eq(schema.canvaOauthSessions.refreshTokenHash, tokenHash),
      ),
    );
}

export type CanvaOAuthSessionAuth = {
  sessionId: string;
  user: {
    localUserId: string;
    workosUserId: string;
    email: string;
  };
  scope: string;
  canvaBrandId: string | null;
};

export async function resolveCanvaOAuthSession(
  accessToken: string,
): Promise<CanvaOAuthSessionAuth | null> {
  if (!isCanvaOAuthAccessToken(accessToken)) {
    return null;
  }

  const tokenHash = hashCanvaOAuthToken(accessToken);
  const now = new Date();

  const [session] = await db
    .select({
      id: schema.canvaOauthSessions.id,
      userId: schema.canvaOauthSessions.userId,
      scope: schema.canvaOauthSessions.scope,
      canvaBrandId: schema.canvaOauthSessions.canvaBrandId,
      workosUserId: schema.users.workosUserId,
      email: schema.users.email,
    })
    .from(schema.canvaOauthSessions)
    .innerJoin(schema.users, eq(schema.canvaOauthSessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.canvaOauthSessions.accessTokenHash, tokenHash),
        isNull(schema.canvaOauthSessions.revokedAt),
        gt(schema.canvaOauthSessions.expiresAt, now),
      ),
    )
    .limit(1);

  if (!session?.workosUserId) {
    return null;
  }

  await db
    .update(schema.canvaOauthSessions)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(schema.canvaOauthSessions.id, session.id));

  return {
    sessionId: session.id,
    user: {
      localUserId: session.userId,
      workosUserId: session.workosUserId,
      email: session.email,
    },
    scope: session.scope,
    canvaBrandId: session.canvaBrandId,
  };
}
