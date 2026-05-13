import "dotenv/config";

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthorizationCode, hashMcpToken } from "@/api/auth/mcp";
import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";

import { createProjectTestFixture } from "../project/project.fixture";

const app = createApp();
const fixture = createProjectTestFixture();
const originalMcpAuthEnabled = env.MCP_AUTH_ENABLED;

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function exchangeCode(input: { code: string; verifier: string }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: "test-client",
    redirect_uri: "http://localhost:8787/callback",
    code_verifier: input.verifier,
  });

  return app.request("http://localhost/api/mcp/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

async function refreshToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: "test-client",
  });

  return app.request("http://localhost/api/mcp/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

async function ensureMcpSessionTable() {
  await db.$client.query(`
    CREATE TABLE IF NOT EXISTS mcp_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE cascade,
      scope text DEFAULT 'mcp' NOT NULL,
      access_token_hash text NOT NULL,
      refresh_token_hash text NOT NULL,
      workos_access_token_encrypted text,
      workos_refresh_token_encrypted text,
      expires_at timestamp with time zone NOT NULL,
      refresh_expires_at timestamp with time zone NOT NULL,
      revoked_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
  await db.$client.query(`
    ALTER TABLE mcp_sessions
    ADD COLUMN IF NOT EXISTS scope text DEFAULT 'mcp' NOT NULL;
  `);
  await db.$client.query(`
    ALTER TABLE mcp_sessions
    ADD COLUMN IF NOT EXISTS workos_access_token_encrypted text;
  `);
  await db.$client.query(`
    ALTER TABLE mcp_sessions
    ADD COLUMN IF NOT EXISTS workos_refresh_token_encrypted text;
  `);
  await db.$client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS mcp_sessions_access_token_hash_key
    ON mcp_sessions (access_token_hash);
  `);
  await db.$client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS mcp_sessions_refresh_token_hash_key
    ON mcp_sessions (refresh_token_hash);
  `);
  await db.$client.query(`
    CREATE INDEX IF NOT EXISTS idx_mcp_sessions_user_id
    ON mcp_sessions (user_id);
  `);
  await db.$client.query(`
    CREATE INDEX IF NOT EXISTS idx_mcp_sessions_organization_id
    ON mcp_sessions (organization_id);
  `);
  await db.$client.query(`
    CREATE INDEX IF NOT EXISTS idx_mcp_sessions_expires_at
    ON mcp_sessions (expires_at);
  `);
  await db.$client.query(`
    CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
      client_id text PRIMARY KEY NOT NULL,
      client_name text,
      redirect_uris jsonb NOT NULL,
      grant_types jsonb DEFAULT '["authorization_code", "refresh_token"]'::jsonb NOT NULL,
      response_types jsonb DEFAULT '["code"]'::jsonb NOT NULL,
      scope text DEFAULT 'mcp' NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
  await db.$client.query(`
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_clients_created_at
    ON mcp_oauth_clients (created_at);
  `);
  await db.$client.query(`
    CREATE TABLE IF NOT EXISTS used_authorization_codes (
      code_hash text PRIMARY KEY NOT NULL,
      expires_at timestamp with time zone NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
  await db.$client.query(`
    CREATE INDEX IF NOT EXISTS idx_used_authorization_codes_expires_at
    ON used_authorization_codes (expires_at);
  `);
}

function setMcpAuthEnabled(value: boolean) {
  Object.defineProperty(env, "MCP_AUTH_ENABLED", {
    configurable: true,
    value,
  });
}

describe("mcpRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
    await ensureMcpSessionTable();
  });

  afterEach(async () => {
    setMcpAuthEnabled(originalMcpAuthEnabled);
    await fixture.cleanup();
    await db.delete(schema.usedAuthorizationCodes);
    await db.delete(schema.mcpOAuthClients);
  });

  it("returns OAuth authorization server metadata", async () => {
    const response = await app.request(
      "http://localhost/api/.well-known/oauth-authorization-server",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      issuer: "http://localhost",
      authorization_endpoint: "http://localhost/api/mcp/authorize",
      token_endpoint: "http://localhost/api/mcp/token",
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("returns an absolute OAuth metadata URI on bearer challenges", async () => {
    const response = await app.request("http://localhost/api/mcp/sse");

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost/.well-known/oauth-authorization-server"',
    );
  });

  it("rejects unsupported token request bodies as invalid requests", async () => {
    const response = await app.request("http://localhost/api/mcp/token", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body: "not form data",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
  });

  it("rejects malformed JSON token request bodies as invalid requests", async () => {
    const response = await app.request("http://localhost/api/mcp/token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
  });

  it("disables MCP OAuth endpoints when MCP auth is disabled", async () => {
    setMcpAuthEnabled(false);

    const authorizeUrl = new URL("http://localhost/api/mcp/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", "test-client");
    authorizeUrl.searchParams.set("redirect_uri", "http://localhost:8787/callback");
    authorizeUrl.searchParams.set("code_challenge", pkceChallenge("a".repeat(64)));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const responses = await Promise.all([
      app.request("http://localhost/api/mcp/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:8787/callback"],
        }),
      }),
      app.request(authorizeUrl),
      app.request("http://localhost/api/mcp/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "test-refresh-token",
        }),
      }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "mcp_auth_disabled" });
    }
  });

  it("persists dynamic client registrations for redirect URI validation", async () => {
    const response = await app.request("http://localhost/api/mcp/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_name: "Test MCP client",
        redirect_uris: ["http://localhost:8787/callback"],
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.client_id).toMatch(/^mcp_/);

    const [client] = await db
      .select()
      .from(schema.mcpOAuthClients)
      .where(eq(schema.mcpOAuthClients.clientId, body.client_id))
      .limit(1);

    expect(client).toMatchObject({
      clientName: "Test MCP client",
      redirectUris: ["http://localhost:8787/callback"],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      scope: "mcp",
    });
  });

  it("rejects authorize requests with unregistered redirect URIs", async () => {
    const registerResponse = await app.request("http://localhost/api/mcp/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        redirect_uris: ["http://localhost:8787/callback"],
      }),
    });
    const { client_id: clientId } = await registerResponse.json();
    const authorizeUrl = new URL("http://localhost/api/mcp/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", "https://attacker.example/callback");
    authorizeUrl.searchParams.set("code_challenge", pkceChallenge("a".repeat(64)));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await app.request(authorizeUrl);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_client" });
  });

  // TODO: Re-enable after diagnosing the CI-only 500 during MCP authorization code exchange.
  it("exchanges a PKCE-bound authorization code for persisted MCP tokens", async () => {
    const identity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;

    if (!auth) {
      throw new Error("expected test auth context");
    }

    const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const code = createAuthorizationCode({
      clientId: "test-client",
      redirectUri: "http://localhost:8787/callback",
      codeChallenge: pkceChallenge(verifier),
      codeChallengeMethod: "S256",
      scope: "mcp",
      userId: auth.user.localUserId,
      organizationId: auth.organization.localOrganizationId,
    });

    const response = await exchangeCode({ code, verifier });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      token_type: "Bearer",
      expires_in: 3600,
      scope: "mcp",
    });
    expect(body.access_token).toMatch(/^hl_mcp_/);
    expect(body.refresh_token).toMatch(/^hl_mcp_/);

    const [session] = await db
      .select()
      .from(schema.mcpSessions)
      .where(eq(schema.mcpSessions.accessTokenHash, hashMcpToken(body.access_token)))
      .limit(1);

    expect(session).toMatchObject({
      userId: auth.user.localUserId,
      organizationId: auth.organization.localOrganizationId,
      scope: "mcp",
      refreshTokenHash: hashMcpToken(body.refresh_token),
    });
  });

  it("rejects an authorization code after it has been exchanged once", async () => {
    const identity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;

    if (!auth) {
      throw new Error("expected test auth context");
    }

    const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const code = createAuthorizationCode({
      clientId: "test-client",
      redirectUri: "http://localhost:8787/callback",
      codeChallenge: pkceChallenge(verifier),
      codeChallengeMethod: "S256",
      scope: "mcp",
      userId: auth.user.localUserId,
      organizationId: auth.organization.localOrganizationId,
    });

    expect((await exchangeCode({ code, verifier })).status).toBe(200);
    expect((await exchangeCode({ code, verifier })).status).toBe(400);
  });

  it("returns the persisted session scope when refreshing tokens", async () => {
    const identity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;

    if (!auth) {
      throw new Error("expected test auth context");
    }

    const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const scope = "mcp repositories:read";
    const code = createAuthorizationCode({
      clientId: "test-client",
      redirectUri: "http://localhost:8787/callback",
      codeChallenge: pkceChallenge(verifier),
      codeChallengeMethod: "S256",
      scope,
      userId: auth.user.localUserId,
      organizationId: auth.organization.localOrganizationId,
    });

    const codeResponse = await exchangeCode({ code, verifier });
    expect(codeResponse.status).toBe(200);
    const codeBody = await codeResponse.json();

    const refreshResponse = await refreshToken(codeBody.refresh_token);

    expect(refreshResponse.status).toBe(200);
    await expect(refreshResponse.json()).resolves.toMatchObject({ scope });
  });
});
