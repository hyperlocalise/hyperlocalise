import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

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
// Encryption utilities (AES-256-GCM with key derived from env secret)
// ---------------------------------------------------------------------------

const MCP_ENCRYPTION_CONTEXT = "mcp-oauth-state-v1";

function getMcpEncryptionKey(): Buffer {
  const masterKey = Buffer.from(env.PROVIDER_CREDENTIALS_MASTER_KEY, "base64");
  return createHmac("sha256", masterKey).update(MCP_ENCRYPTION_CONTEXT).digest();
}

function encryptString(plaintext: string): string {
  const key = getMcpEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

function decryptString(ciphertext: string): string {
  const key = getMcpEncryptionKey();
  const data = Buffer.from(ciphertext, "base64url");
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Database-backed OAuth state store (TTL 10 min)
// ---------------------------------------------------------------------------

type OAuthState = {
  mcpClientId: string;
  mcpCodeChallenge: string;
  mcpRedirectUri: string;
  workosCodeVerifier: string;
};

export async function storeOAuthState(
  state: string,
  mcpCodeChallenge: string,
  mcpRedirectUri: string,
  mcpClientId: string,
): Promise<string> {
  const workosCodeVerifier = generateCodeVerifier();
  const encryptedVerifier = encryptString(workosCodeVerifier);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db
    .insert(schema.mcpOAuthStates)
    .values({
      state,
      mcpClientId,
      mcpCodeChallenge,
      mcpRedirectUri,
      workosCodeVerifier: encryptedVerifier,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: schema.mcpOAuthStates.state,
      set: {
        mcpClientId,
        mcpCodeChallenge,
        mcpRedirectUri,
        workosCodeVerifier: encryptedVerifier,
        expiresAt,
      },
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
    mcpClientId: row.mcpClientId,
    mcpCodeChallenge: row.mcpCodeChallenge,
    mcpRedirectUri: row.mcpRedirectUri,
    workosCodeVerifier: decryptString(row.workosCodeVerifier),
  };
}

export async function deleteOAuthState(state: string): Promise<void> {
  await db.delete(schema.mcpOAuthStates).where(eq(schema.mcpOAuthStates.state, state));
}

export async function consumeOAuthState(state: string): Promise<OAuthState | undefined> {
  const [row] = await db
    .delete(schema.mcpOAuthStates)
    .where(eq(schema.mcpOAuthStates.state, state))
    .returning();

  if (!row) return undefined;
  if (new Date() > row.expiresAt) {
    return undefined;
  }

  return {
    mcpClientId: row.mcpClientId,
    mcpCodeChallenge: row.mcpCodeChallenge,
    mcpRedirectUri: row.mcpRedirectUri,
    workosCodeVerifier: decryptString(row.workosCodeVerifier),
  };
}

// ---------------------------------------------------------------------------
// Database-backed auth code store (TTL 5 min)
// ---------------------------------------------------------------------------

type AuthCodeEntry = {
  userId: string;
  organizationId: string;
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
};

export async function storeAuthCode(code: string, entry: AuthCodeEntry): Promise<void> {
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await db.insert(schema.mcpAuthCodes).values({
    codeHash,
    ...entry,
    expiresAt,
  });
}

export async function getAuthCode(code: string): Promise<AuthCodeEntry | undefined> {
  const codeHash = hashToken(code);
  const [row] = await db
    .select()
    .from(schema.mcpAuthCodes)
    .where(eq(schema.mcpAuthCodes.codeHash, codeHash));

  if (!row) return undefined;
  if (new Date() > row.expiresAt) {
    await deleteAuthCode(code);
    return undefined;
  }

  return {
    userId: row.userId,
    organizationId: row.organizationId,
    clientId: row.clientId,
    codeChallenge: row.codeChallenge,
    redirectUri: row.redirectUri,
  };
}

export async function deleteAuthCode(code: string): Promise<void> {
  const codeHash = hashToken(code);
  await db.delete(schema.mcpAuthCodes).where(eq(schema.mcpAuthCodes.codeHash, codeHash));
}

export async function consumeAuthCode(code: string): Promise<AuthCodeEntry | undefined> {
  const codeHash = hashToken(code);
  const [row] = await db
    .delete(schema.mcpAuthCodes)
    .where(eq(schema.mcpAuthCodes.codeHash, codeHash))
    .returning();

  if (!row) return undefined;
  if (new Date() > row.expiresAt) {
    return undefined;
  }

  return {
    userId: row.userId,
    organizationId: row.organizationId,
    clientId: row.clientId,
    codeChallenge: row.codeChallenge,
    redirectUri: row.redirectUri,
  };
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
  if (!env.WORKOS_API_KEY) {
    throw new Error("workos_exchange_failed: WORKOS_API_KEY is not configured");
  }
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

export async function createMcpSession(userId: string, organizationId: string, clientId?: string) {
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
    clientId,
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

/** Rotates tokens only if refresh_token and client_id still match (single atomic UPDATE). */
export async function rotateMcpRefreshToken(refreshToken: string, clientId: string) {
  const oldRefreshHash = hashToken(refreshToken);
  const newAccessToken = generateToken();
  const newRefreshToken = generateToken();
  const newAccessTokenHash = hashToken(newAccessToken);
  const newRefreshTokenHash = hashToken(newRefreshToken);
  const tokenLifetimeMinutes = env.MCP_TOKEN_LIFETIME_MINUTES;
  const expiresAt = new Date(Date.now() + tokenLifetimeMinutes * 60 * 1000);

  const [row] = await db
    .update(schema.mcpSessions)
    .set({
      accessTokenHash: newAccessTokenHash,
      refreshTokenHash: newRefreshTokenHash,
      expiresAt,
    })
    .where(
      and(
        eq(schema.mcpSessions.refreshTokenHash, oldRefreshHash),
        eq(schema.mcpSessions.clientId, clientId),
        gt(schema.mcpSessions.refreshTokenExpiresAt, new Date()),
      ),
    )
    .returning({ id: schema.mcpSessions.id });

  if (!row) return null;

  return { accessToken: newAccessToken, refreshToken: newRefreshToken, expiresAt };
}
