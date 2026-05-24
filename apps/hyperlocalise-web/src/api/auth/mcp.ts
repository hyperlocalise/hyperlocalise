import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { EvlogVariables } from "evlog/hono";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";

export type McpAuthVariables = EvlogVariables["Variables"] & {
  mcpAuth: {
    user: {
      localUserId: string;
      workosUserId: string;
      email: string;
    };
    organization: {
      localOrganizationId: string;
      workosOrganizationId: string;
      name: string;
      slug: string | null;
    };
    session: {
      id: string;
    };
  };
};

type AuthorizationCodePayload = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  state?: string;
  userId: string;
  organizationId: string;
  expiresAt: number;
  nonce: string;
};

const TOKEN_PREFIX = "hl_mcp_";

function getMcpSecret(): Buffer {
  const configuredKey = env.MCP_ENCRYPTION_KEY ?? env.PROVIDER_CREDENTIALS_MASTER_KEY;
  const decoded = Buffer.from(configuredKey, "base64");

  if (decoded.length === 32) {
    return decoded;
  }

  return createHash("sha256").update(configuredKey).digest();
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string): string {
  return createHmac("sha256", getMcpSecret()).update(value).digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateMcpToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyPkceChallenge(input: {
  codeVerifier: string;
  codeChallenge: string;
  method: "S256";
}): boolean {
  const expectedChallenge = createHash("sha256").update(input.codeVerifier).digest("base64url");
  return constantTimeEqual(expectedChallenge, input.codeChallenge);
}

export function createAuthorizationCode(
  payload: Omit<AuthorizationCodePayload, "expiresAt" | "nonce">,
) {
  const fullPayload: AuthorizationCodePayload = {
    ...payload,
    expiresAt: Date.now() + 5 * 60 * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = base64Url(JSON.stringify(fullPayload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parseAuthorizationCode(code: string): AuthorizationCodePayload | null {
  const [encodedPayload, signature] = code.split(".");
  if (!encodedPayload || !signature || !constantTimeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  let payload: AuthorizationCodePayload;
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

export async function markAuthorizationCodeUsed(
  code: string,
  payload: AuthorizationCodePayload,
): Promise<boolean> {
  await db
    .delete(schema.usedAuthorizationCodes)
    .where(lt(schema.usedAuthorizationCodes.expiresAt, new Date()));

  const [usedCode] = await db
    .insert(schema.usedAuthorizationCodes)
    .values({
      codeHash: createHash("sha256").update(code).digest("hex"),
      expiresAt: new Date(payload.expiresAt),
    })
    .onConflictDoNothing()
    .returning({ codeHash: schema.usedAuthorizationCodes.codeHash });

  return Boolean(usedCode);
}

export function encryptMcpSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getMcpSecret(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((item) => item.toString("base64url")).join(".");
}

export function decryptMcpSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const [iv, authTag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));

  if (!iv || !authTag || !ciphertext) {
    return null;
  }

  const decipher = createDecipheriv("aes-256-gcm", getMcpSecret(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function getMcpTokenExpiry() {
  const now = Date.now();

  return {
    accessTokenExpiresAt: new Date(now + env.MCP_TOKEN_LIFETIME_MINUTES * 60 * 1000),
    refreshTokenExpiresAt: new Date(
      now + env.MCP_REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
    ),
  };
}

export const mcpBearerAuthMiddleware = createMiddleware<{ Variables: McpAuthVariables }>(
  async (c, next) => {
    if (!env.MCP_AUTH_ENABLED) {
      return c.json({ error: "mcp_auth_disabled" }, 503);
    }

    const authorization = c.req.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;

    if (!token) {
      return c.json({ error: "unauthorized" }, 401, {
        "WWW-Authenticate": `Bearer resource_metadata="${new URL("/.well-known/oauth-authorization-server", c.req.url).origin}/.well-known/oauth-authorization-server"`,
      });
    }

    const [session] = await db
      .select({
        id: schema.mcpSessions.id,
        userId: schema.users.id,
        workosUserId: schema.users.workosUserId,
        email: schema.users.email,
        organizationId: schema.organizations.id,
        workosOrganizationId: schema.organizations.workosOrganizationId,
        organizationName: schema.organizations.name,
        organizationSlug: schema.organizations.slug,
      })
      .from(schema.mcpSessions)
      .innerJoin(schema.users, eq(schema.mcpSessions.userId, schema.users.id))
      .innerJoin(
        schema.organizations,
        eq(schema.mcpSessions.organizationId, schema.organizations.id),
      )
      .innerJoin(
        schema.organizationMemberships,
        and(
          eq(schema.organizationMemberships.userId, schema.mcpSessions.userId),
          eq(schema.organizationMemberships.organizationId, schema.mcpSessions.organizationId),
        ),
      )
      .where(
        and(
          eq(schema.mcpSessions.accessTokenHash, hashMcpToken(token)),
          gt(schema.mcpSessions.expiresAt, new Date()),
          isNull(schema.mcpSessions.revokedAt),
          eq(schema.organizations.lifecycleStatus, "active"),
        ),
      )
      .limit(1);

    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    c.set("mcpAuth", {
      user: {
        localUserId: session.userId,
        workosUserId: session.workosUserId,
        email: session.email,
      },
      organization: {
        localOrganizationId: session.organizationId,
        workosOrganizationId: session.workosOrganizationId,
        name: session.organizationName,
        slug: session.organizationSlug,
      },
      session: {
        id: session.id,
      },
    });
    c.get("log").set({
      auth: {
        mcpSessionId: session.id,
        localUserId: session.userId,
        localOrganizationId: session.organizationId,
      },
    });

    await next();
  },
);
