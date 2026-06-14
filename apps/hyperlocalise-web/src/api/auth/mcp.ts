import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { and, eq, gt, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { EvlogVariables } from "evlog/hono";

import { forbiddenResponse } from "@/api/errors";
import {
  isMembershipReconcileFresh,
  reconcileWorkosMembershipsForUser,
} from "@/api/auth/workos-membership-reconcile";
import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { env } from "@/lib/env";
import { REPLACING_WORKOS_MEMBERSHIP_ID } from "@/lib/workos/constants";

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
    membership: {
      workosMembershipId: string | null;
      role: OrganizationMembershipRole;
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

export type McpAuthorizationRequestPayload = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  state?: string;
  organizationSlug?: string;
  expiresAt: number;
  nonce: string;
};

export type McpConsentGrantPayload = {
  requestNonce: string;
  userId: string;
  organizationId: string;
  expiresAt: number;
};

export const MCP_AUTH_REQUEST_COOKIE = "hl_mcp_auth_req";
export const MCP_CONSENT_COOKIE = "hl_mcp_consent";

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

export function createMcpAuthorizationRequest(
  payload: Omit<McpAuthorizationRequestPayload, "expiresAt" | "nonce">,
) {
  const fullPayload: McpAuthorizationRequestPayload = {
    ...payload,
    expiresAt: Date.now() + 15 * 60 * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  return createSignedPayload(fullPayload);
}

export function parseMcpAuthorizationRequest(token: string): McpAuthorizationRequestPayload | null {
  return parseSignedPayload<McpAuthorizationRequestPayload>(token);
}

export function createMcpConsentGrant(payload: Omit<McpConsentGrantPayload, "expiresAt">) {
  const fullPayload: McpConsentGrantPayload = {
    ...payload,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  return createSignedPayload(fullPayload);
}

export function parseMcpConsentGrant(token: string): McpConsentGrantPayload | null {
  return parseSignedPayload<McpConsentGrantPayload>(token);
}

export function parseAuthorizationCode(code: string): AuthorizationCodePayload | null {
  const separatorIndex = code.indexOf(".");
  if (separatorIndex <= 0 || code.indexOf(".", separatorIndex + 1) !== -1) {
    return null;
  }

  const encodedPayload = code.slice(0, separatorIndex);
  const signature = code.slice(separatorIndex + 1);
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

export function canonicalAuthorizationCode(code: string): string | null {
  const separatorIndex = code.indexOf(".");
  if (separatorIndex <= 0) {
    return null;
  }

  const secondSeparatorIndex = code.indexOf(".", separatorIndex + 1);
  if (secondSeparatorIndex === -1) {
    return code;
  }

  return code.slice(0, secondSeparatorIndex);
}

export async function markAuthorizationCodeUsed(
  code: string,
  payload: AuthorizationCodePayload,
): Promise<boolean> {
  const canonicalCode = canonicalAuthorizationCode(code);
  if (!canonicalCode) {
    return false;
  }

  await db
    .delete(schema.usedAuthorizationCodes)
    .where(lt(schema.usedAuthorizationCodes.expiresAt, new Date()));

  const [usedCode] = await db
    .insert(schema.usedAuthorizationCodes)
    .values({
      codeHash: createHash("sha256").update(canonicalCode).digest("hex"),
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

type McpSessionRecord = {
  id: string;
  userId: string;
  workosUserId: string;
  email: string;
  organizationId: string;
  workosOrganizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  lifecycleStatus: string;
};

export type ResolveAuthoritativeMcpSessionAuthResult =
  | { status: "authorized"; auth: McpAuthVariables["mcpAuth"] }
  | { status: "unauthorized" }
  | { status: "workspace_archived" };

async function revokeMcpSession(sessionId: string) {
  await db.delete(schema.mcpSessions).where(eq(schema.mcpSessions.id, sessionId));
}

export async function resolveAuthoritativeMcpSessionAuth(
  session: McpSessionRecord,
): Promise<ResolveAuthoritativeMcpSessionAuthResult> {
  if (session.lifecycleStatus !== "active") {
    return { status: "workspace_archived" };
  }

  const reconcileResult = await reconcileWorkosMembershipsForUser(db, {
    workosUserId: session.workosUserId,
    email: session.email,
    workosOrganizationId: session.workosOrganizationId,
  });

  if (reconcileResult.status === "lookup_failed") {
    if (!isMembershipReconcileFresh(reconcileResult.lastReconciledAt)) {
      return { status: "unauthorized" };
    }
  }

  const [membership] = await db
    .select({
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
      role: schema.organizationMemberships.role,
    })
    .from(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.userId, session.userId),
        eq(schema.organizationMemberships.organizationId, session.organizationId),
        isNotNull(schema.organizationMemberships.workosMembershipId),
        ne(schema.organizationMemberships.workosMembershipId, REPLACING_WORKOS_MEMBERSHIP_ID),
      ),
    )
    .limit(1);

  if (!membership) {
    await revokeMcpSession(session.id);
    return { status: "unauthorized" };
  }

  return {
    status: "authorized",
    auth: {
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
      membership: {
        workosMembershipId: membership.workosMembershipId,
        role: membership.role,
      },
      session: {
        id: session.id,
      },
    },
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
        lifecycleStatus: schema.organizations.lifecycleStatus,
      })
      .from(schema.mcpSessions)
      .innerJoin(schema.users, eq(schema.mcpSessions.userId, schema.users.id))
      .innerJoin(
        schema.organizations,
        eq(schema.mcpSessions.organizationId, schema.organizations.id),
      )
      .where(
        and(
          eq(schema.mcpSessions.accessTokenHash, hashMcpToken(token)),
          gt(schema.mcpSessions.expiresAt, new Date()),
          isNull(schema.mcpSessions.revokedAt),
        ),
      )
      .limit(1);

    if (!session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const authResult = await resolveAuthoritativeMcpSessionAuth(session);

    if (authResult.status === "unauthorized") {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (authResult.status === "workspace_archived") {
      return forbiddenResponse(c, "workspace_archived", "This workspace has been archived");
    }

    c.set("mcpAuth", authResult.auth);
    c.get("log").set({
      auth: {
        mcpSessionId: authResult.auth.session.id,
        localUserId: authResult.auth.user.localUserId,
        localOrganizationId: authResult.auth.organization.localOrganizationId,
      },
    });

    await next();
  },
);
