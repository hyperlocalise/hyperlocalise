import { createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Token utilities
// ---------------------------------------------------------------------------

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function generateAuthCode(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateCodeVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return base64urlEncode(createHash("sha256").update(verifier).digest());
}

function base64urlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

// ---------------------------------------------------------------------------
// In-memory OAuth state store (TTL 10 min)
// ---------------------------------------------------------------------------

type OAuthState = {
  mcpCodeChallenge: string;
  mcpRedirectUri: string;
  workosCodeVerifier: string;
  expiresAt: number;
};

const oauthStates = new Map<string, OAuthState>();

function cleanupExpiredStates(): void {
  const now = Date.now();
  for (const [key, entry] of oauthStates) {
    if (now > entry.expiresAt) oauthStates.delete(key);
  }
}

setInterval(cleanupExpiredStates, 5 * 60 * 1000);

export function storeOAuthState(
  state: string,
  mcpCodeChallenge: string,
  mcpRedirectUri: string,
): string {
  const workosCodeVerifier = generateCodeVerifier();
  oauthStates.set(state, {
    mcpCodeChallenge,
    mcpRedirectUri,
    workosCodeVerifier,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return workosCodeVerifier;
}

export function getOAuthState(state: string): OAuthState | undefined {
  cleanupExpiredStates();
  return oauthStates.get(state);
}

export function deleteOAuthState(state: string): void {
  oauthStates.delete(state);
}

// ---------------------------------------------------------------------------
// In-memory auth code store (TTL 5 min)
// ---------------------------------------------------------------------------

type AuthCodeEntry = {
  userId: string;
  organizationId: string;
  codeChallenge: string;
  redirectUri: string;
  expiresAt: number;
};

const authCodes = new Map<string, AuthCodeEntry>();

function cleanupExpiredCodes(): void {
  const now = Date.now();
  for (const [key, entry] of authCodes) {
    if (now > entry.expiresAt) authCodes.delete(key);
  }
}

setInterval(cleanupExpiredCodes, 5 * 60 * 1000);

export function storeAuthCode(code: string, entry: Omit<AuthCodeEntry, "expiresAt">): void {
  authCodes.set(code, {
    ...entry,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

export function getAuthCode(code: string): AuthCodeEntry | undefined {
  cleanupExpiredCodes();
  return authCodes.get(code);
}

export function deleteAuthCode(code: string): void {
  authCodes.delete(code);
}

// ---------------------------------------------------------------------------
// WorkOS code exchange
// ---------------------------------------------------------------------------

export type WorkosUser = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
};

export type WorkosAuthenticateResponse = {
  user: WorkosUser;
  organization_id?: string;
};

export async function exchangeWorkosCode(
  code: string,
  codeVerifier: string,
): Promise<WorkosAuthenticateResponse> {
  const response = await fetch("https://api.workos.com/user_management/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.WORKOS_CLIENT_ID,
      client_secret: env.WORKOS_API_KEY,
      code,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new Error(`workos_exchange_failed: ${response.status} ${text}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// MCP session management
// ---------------------------------------------------------------------------

export async function createMcpSession(userId: string, organizationId: string) {
  const accessToken = generateToken();
  const refreshToken = generateToken();
  const accessTokenHash = hashToken(accessToken);
  const refreshTokenHash = hashToken(refreshToken);

  const tokenLifetimeMinutes = env.MCP_TOKEN_LIFETIME_MINUTES;
  const expiresAt = new Date(Date.now() + tokenLifetimeMinutes * 60 * 1000);

  await db.insert(schema.mcpSessions).values({
    userId,
    organizationId,
    accessTokenHash,
    refreshTokenHash,
    expiresAt,
  });

  return { accessToken, refreshToken, expiresAt };
}

export async function validateMcpToken(token: string) {
  const hash = hashToken(token);
  const [session] = await db
    .select()
    .from(schema.mcpSessions)
    .where(eq(schema.mcpSessions.accessTokenHash, hash))
    .limit(1);

  if (!session) return null;
  if (new Date() > session.expiresAt) return null;

  return session;
}

export async function validateRefreshToken(token: string) {
  const hash = hashToken(token);
  const [session] = await db
    .select()
    .from(schema.mcpSessions)
    .where(eq(schema.mcpSessions.refreshTokenHash, hash))
    .limit(1);

  if (!session) return null;
  return session;
}

export async function refreshMcpSession(sessionId: string) {
  const newAccessToken = generateToken();
  const newRefreshToken = generateToken();
  const newAccessTokenHash = hashToken(newAccessToken);
  const newRefreshTokenHash = hashToken(newRefreshToken);
  const tokenLifetimeMinutes = env.MCP_TOKEN_LIFETIME_MINUTES;
  const expiresAt = new Date(Date.now() + tokenLifetimeMinutes * 60 * 1000);

  await db
    .update(schema.mcpSessions)
    .set({
      accessTokenHash: newAccessTokenHash,
      refreshTokenHash: newRefreshTokenHash,
      expiresAt,
    })
    .where(eq(schema.mcpSessions.id, sessionId));

  return { accessToken: newAccessToken, refreshToken: newRefreshToken, expiresAt };
}
