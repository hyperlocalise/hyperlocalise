import "dotenv/config";

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import {
  createAuthorizationCode,
  createMcpAuthorizationRequest,
  createMcpConsentGrant,
  hashMcpToken,
  MCP_AUTH_REQUEST_COOKIE,
  MCP_CONSENT_COOKIE,
  parseMcpAuthorizationRequest,
} from "@/api/auth/mcp";
import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";

import { createProjectTestFixture } from "../project/project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

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

function setMcpAuthEnabled(value: boolean) {
  Object.defineProperty(env, "MCP_AUTH_ENABLED", {
    configurable: true,
    value,
  });
}

describe("mcpRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
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

  it("redirects callback to consent when the user has not approved the client", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;

    if (!auth) {
      throw new Error("expected test auth context");
    }

    await db.insert(schema.mcpOAuthClients).values({
      clientId: "test-client",
      redirectUris: ["http://localhost:8787/callback"],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      scope: "mcp",
    });

    const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const challenge = pkceChallenge(verifier);
    const authRequest = createMcpAuthorizationRequest({
      clientId: "test-client",
      redirectUri: "http://localhost:8787/callback",
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      scope: "mcp",
    });

    const callbackUrl = new URL("http://localhost/api/mcp/callback");
    callbackUrl.searchParams.set("response_type", "code");
    callbackUrl.searchParams.set("client_id", "test-client");
    callbackUrl.searchParams.set("redirect_uri", "http://localhost:8787/callback");
    callbackUrl.searchParams.set("code_challenge", challenge);
    callbackUrl.searchParams.set("code_challenge_method", "S256");

    const response = await app.request(callbackUrl, {
      headers: {
        ...headers,
        cookie: `${MCP_AUTH_REQUEST_COOKIE}=${authRequest}`,
      },
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toContain("/api/mcp/consent");
    expect(location).not.toContain("code=");
  });

  it("issues an authorization code after explicit consent", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;

    if (!auth) {
      throw new Error("expected test auth context");
    }

    await db.insert(schema.mcpOAuthClients).values({
      clientId: "test-client",
      redirectUris: ["http://localhost:8787/callback"],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      scope: "mcp",
    });

    const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const challenge = pkceChallenge(verifier);
    const authRequestPayload = {
      clientId: "test-client",
      redirectUri: "http://localhost:8787/callback",
      codeChallenge: challenge,
      codeChallengeMethod: "S256" as const,
      scope: "mcp",
    };
    const authRequest = createMcpAuthorizationRequest(authRequestPayload);
    const parsedRequest = parseMcpAuthorizationRequest(authRequest);
    if (!parsedRequest) {
      throw new Error("expected parsed MCP authorization request");
    }
    const consentGrant = createMcpConsentGrant({
      requestNonce: parsedRequest.nonce,
      userId: auth.user.localUserId,
      organizationId: auth.organization.localOrganizationId,
    });

    const callbackUrl = new URL("http://localhost/api/mcp/callback");
    callbackUrl.searchParams.set("response_type", "code");
    callbackUrl.searchParams.set("client_id", "test-client");
    callbackUrl.searchParams.set("redirect_uri", "http://localhost:8787/callback");
    callbackUrl.searchParams.set("code_challenge", challenge);
    callbackUrl.searchParams.set("code_challenge_method", "S256");

    const response = await app.request(callbackUrl, {
      headers: {
        ...headers,
        cookie: `${MCP_AUTH_REQUEST_COOKIE}=${authRequest}; ${MCP_CONSENT_COOKIE}=${consentGrant}`,
      },
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toMatch(/^http:\/\/localhost:8787\/callback\?code=/);
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
