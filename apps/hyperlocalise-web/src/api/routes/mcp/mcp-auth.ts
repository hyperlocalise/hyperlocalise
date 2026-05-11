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
// Database-backed OAuth state store (TTL 10 min)
// ---------------------------------------------------------------------------

type OAuthState = {
  mcpCodeChallenge: string;
  mcpRedirectUri: string;
  workosCodeVerifier: string;
};

export async function storeOAuthState(
  state: string,
  mcpCodeChallenge: string,
  mcpRedirectUri: string,
): Promise<string> {
  const workosCodeVerifier = generateCodeVerifier();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(schema.mcpOAuthStates).values({
    state,
    mcpCodeChallenge,
    mcpRedirectUri,
    workosCodeVerifier,
    expiresAt,
  });
  return workosCodeVerifier;
}

export async function getOAuthState(state: string): Promise<OAuthState | undefined> {
  const [row] = await db
    .select()
    .from(schema.mcpOAuthStates)
    .where(eq(schema.mcpOAuthStates.state, state));

  if (!row) return undefined;
  if (new Date() > row.expiresAt) {
    await deleteOAuthState(state);
    return undefined;
  }

  return {
    mcpCodeChallenge: row.mcpCodeChallenge,
    mcpRedirectUri: row.mcpRedirectUri,
    workosCodeVerifier: row.workosCodeVerifier,
  };
}

export async function deleteOAuthState(state: string): Promise<void> {
  await db.delete(schema.mcpOAuthStates).where(eq(schema.mcpOAuthStates.state, state));
}

// ---------------------------------------------------------------------------
// Database-backed auth code store (TTL 5 min)
// ---------------------------------------------------------------------------

type AuthCodeEntry = {
  userId: string;
  organizationId: string;
  codeChallenge: string;
  redirectUri: string;
};

export async function storeAuthCode(code: string, entry: AuthCodeEntry): Promise<void> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await db.insert(schema.mcpAuthCodes).values({
    code,
    ...entry,
    expiresAt,
  });
}

export async function getAuthCode(code: string): Promise<AuthCodeEntry | undefined> {
  const [row] = await db
    .select()
    .from(schema.mcpAuthCodes)
    .where(eq(schema.mcpAuthCodes.code, code));

  if (!row) return undefined;
  if (new Date() > row.expiresAt) {
    await deleteAuthCode(code);
    return undefined;
  }

  return {
    userId: row.userId,
    organizationId: row.organizationId,
    codeChallenge: row.codeChallenge,
    redirectUri: row.redirectUri,
  };
}

export async function deleteAuthCode(code: string): Promise<void> {
  await db.delete(schema.mcpAuthCodes).where(eq(schema.mcpAuthCodes.code, code));
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

  const refreshTokenLifetimeDays = env.MCP_REFRESH_TOKEN_LIFETIME_DAYS;
  const refreshTokenExpiresAt = new Date(
    Date.now() + refreshTokenLifetimeDays * 24 * 60 * 60 * 1000,
  );

  await db.insert(schema.mcpSessions).values({
    userId,
    organizationId,
    accessTokenHash,
    refreshTokenHash,
    expiresAt,
    refreshTokenExpiresAt,
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
  if (new Date() > session.refreshTokenExpiresAt) return null;

  return session;
}

export async function refreshMcpSession(sessionId: string) {
  const newAccessToken = generateToken();
  const newRefreshToken = generateToken();
  const newAccessTokenHash = hashToken(newAccessToken);
  const newRefreshTokenHash = hashToken(newRefreshToken);
  const tokenLifetimeMinutes = env.MCP_TOKEN_LIFETIME_MINUTES;
  const expiresAt = new Date(Date.now() + tokenLifetimeMinutes * 60 * 1000);

  const refreshTokenLifetimeDays = env.MCP_REFRESH_TOKEN_LIFETIME_DAYS;
  const refreshTokenExpiresAt = new Date(
    Date.now() + refreshTokenLifetimeDays * 24 * 60 * 60 * 1000,
  );

  await db
    .update(schema.mcpSessions)
    .set({
      accessTokenHash: newAccessTokenHash,
      refreshTokenHash: newRefreshTokenHash,
      expiresAt,
      refreshTokenExpiresAt,
    })
    .where(eq(schema.mcpSessions.id, sessionId));

  return { accessToken: newAccessToken, refreshToken: newRefreshToken, expiresAt };
}
