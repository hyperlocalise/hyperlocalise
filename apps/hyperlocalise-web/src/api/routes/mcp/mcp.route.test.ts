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
import "dotenv/config";

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { OAuthProtectedResourceMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
  createAuthorizationCode,
  createMcpAuthorizationRequest,
  createMcpConsentGrant,
  generateMcpToken,
  hashMcpToken,
  MCP_AUTH_REQUEST_COOKIE,
  MCP_CONSENT_COOKIE,
  parseMcpAuthorizationRequest,
} from "@/api/auth/mcp";
import { createMcpTestApp } from "@/api/routes/mcp/mcp.fixture";
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

const { resolveMcpClientMetadataMock } = vi.hoisted(() => ({
  resolveMcpClientMetadataMock: vi.fn(),
}));

vi.mock("@/api/auth/mcp-client-metadata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/mcp-client-metadata")>();

  return {
    ...actual,
    resolveMcpClientMetadata: resolveMcpClientMetadataMock,
  };
});

const app = createMcpTestApp();
const apiApp = createApp();
const fixture = createProjectTestFixture();
const originalMcpAuthEnabled = env.MCP_AUTH_ENABLED;
const originalMcpAllowDynamicRegistration = env.MCP_ALLOW_DYNAMIC_REGISTRATION;

function setMcpAllowDynamicRegistration(value: boolean) {
  Object.defineProperty(env, "MCP_ALLOW_DYNAMIC_REGISTRATION", {
    configurable: true,
    value,
  });
}

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

  return app.request("http://localhost/mcp/token", {
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

  return app.request("http://localhost/mcp/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

async function authenticatedMcpHeaders() {
  const identity = fixture.createWorkosIdentity();
  const headers = await fixture.authHeadersFor(identity);

  const accessToken = generateMcpToken();
  const refreshToken = generateMcpToken();

  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("expected test auth context");
  }

  await db.insert(schema.mcpSessions).values({
    userId: auth.user.localUserId,
    organizationId: auth.organization.localOrganizationId,
    scope: "mcp",
    accessTokenHash: hashMcpToken(accessToken),
    refreshTokenHash: hashMcpToken(refreshToken),
    expiresAt: new Date(Date.now() + 60_000),
    refreshExpiresAt: new Date(Date.now() + 120_000),
  });

  return {
    ...headers,
    authorization: `Bearer ${accessToken}`,
  };
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
    resolveMcpClientMetadataMock.mockReset();
    setMcpAuthEnabled(originalMcpAuthEnabled);
    setMcpAllowDynamicRegistration(originalMcpAllowDynamicRegistration);
    await fixture.cleanup();
    await db.delete(schema.usedAuthorizationCodes);
    await db.delete(schema.mcpOAuthClients);
  });

  it("returns OAuth authorization server metadata", async () => {
    const response = await app.request("http://localhost/.well-known/oauth-authorization-server");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      issuer: "http://localhost",
      authorization_endpoint: "http://localhost/mcp/authorize",
      token_endpoint: "http://localhost/mcp/token",
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
    });
  });

  it("does not advertise dynamic registration when disabled", async () => {
    setMcpAllowDynamicRegistration(false);

    const response = await app.request("http://localhost/.well-known/oauth-authorization-server");
    const metadata = await response.json();

    expect(metadata).not.toHaveProperty("registration_endpoint");
  });

  it("advertises dynamic registration when enabled", async () => {
    setMcpAllowDynamicRegistration(true);

    const response = await app.request("http://localhost/.well-known/oauth-authorization-server");

    await expect(response.json()).resolves.toMatchObject({
      registration_endpoint: "http://localhost/mcp/register",
    });
  });

  it("returns an absolute OAuth metadata URI on bearer challenges", async () => {
    const response = await app.request("http://localhost/mcp/sse");

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource", scope="mcp"',
    );
  });

  it("returns the protected-resource challenge for invalid bearer tokens", async () => {
    const response = await app.request("http://localhost/mcp/sse", {
      headers: {
        authorization: "Bearer invalid-token",
      },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource", scope="mcp"',
    );
  });

  it("returns OAuth protected resource metadata", async () => {
    const response = await app.request("http://localhost/.well-known/oauth-protected-resource");

    expect(response.status).toBe(200);

    const metadata = OAuthProtectedResourceMetadataSchema.parse(await response.json());

    expect(metadata).toMatchObject({
      resource: "http://localhost/mcp/sse",
      authorization_servers: ["http://localhost"],
      scopes_supported: ["mcp"],
    });
  });

  it.each([
    {
      state: "expired",
      expiresAt: new Date(0),
      revokedAt: null,
    },
    {
      state: "revoked",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    },
  ])(
    "returns the protected-resource challenge for $state tokens",
    async ({ expiresAt, revokedAt }) => {
      const identity = fixture.createWorkosIdentity();
      await fixture.authHeadersFor(identity);

      const auth = globalThis.__testApiAuthContext;
      if (!auth) {
        throw new Error("expected test auth context");
      }

      const accessToken = generateMcpToken();
      const refreshToken = generateMcpToken();

      await db.insert(schema.mcpSessions).values({
        userId: auth.user.localUserId,
        organizationId: auth.organization.localOrganizationId,
        scope: "mcp",
        accessTokenHash: hashMcpToken(accessToken),
        refreshTokenHash: hashMcpToken(refreshToken),
        expiresAt,
        refreshExpiresAt: new Date(Date.now() + 60_000),
        revokedAt,
      });

      const response = await app.request("http://localhost/mcp/sse", {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource", scope="mcp"',
      );
    },
  );

  it("rejects unsupported token request bodies as invalid requests", async () => {
    const response = await app.request("http://localhost/mcp/token", {
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
    const response = await app.request("http://localhost/mcp/token", {
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

    const authorizeUrl = new URL("http://localhost/mcp/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", "test-client");
    authorizeUrl.searchParams.set("redirect_uri", "http://localhost:8787/callback");
    authorizeUrl.searchParams.set("code_challenge", pkceChallenge("a".repeat(64)));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const responses = await Promise.all([
      app.request("http://localhost/mcp/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:8787/callback"],
        }),
      }),
      app.request(authorizeUrl),
      app.request("http://localhost/mcp/token", {
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
    const response = await app.request("http://localhost/mcp/register", {
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
    const registerResponse = await app.request("http://localhost/mcp/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        redirect_uris: ["http://localhost:8787/callback"],
      }),
    });
    const { client_id: clientId } = await registerResponse.json();
    const authorizeUrl = new URL("http://localhost/mcp/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", "https://attacker.example/callback");
    authorizeUrl.searchParams.set("code_challenge", pkceChallenge("a".repeat(64)));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await app.request(authorizeUrl);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_client" });
  });

  it("does not expose MCP through the API alias", async () => {
    const response = await apiApp.request("http://localhost/api/mcp/sse");

    expect(response.status).toBe(404);
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

    const callbackUrl = new URL("http://localhost/mcp/callback");
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
    expect(location).toContain("/mcp/consent");
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

    const callbackUrl = new URL("http://localhost/mcp/callback");
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
  it("accepts a client identified by a Client ID Metadata Document", async () => {
    const clientId = "https://client.example/oauth/metadata.json";
    const redirectUri = "http://localhost:3000/callback";

    resolveMcpClientMetadataMock.mockResolvedValue({
      ok: true,
      value: {
        clientId,
        clientName: "Example MCP Client",
        redirectUris: [redirectUri],
      },
    });

    const authorizeUrl = new URL("http://localhost/mcp/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("code_challenge", pkceChallenge("a".repeat(64)));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await app.request(authorizeUrl);

    expect(resolveMcpClientMetadataMock).toHaveBeenCalledWith({
      clientId,
      redirectUri,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/auth/sign-in");
  });

  it("shows the CIMD client name on the consent page", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const clientId = "https://client.example/oauth/metadata.json";
    const redirectUri = "http://localhost:3000/callback";
    const challenge = pkceChallenge("a".repeat(64));

    resolveMcpClientMetadataMock.mockResolvedValue({
      ok: true,
      value: {
        clientId,
        clientName: "Example MCP Client",
        redirectUris: [redirectUri],
      },
    });

    const authRequest = createMcpAuthorizationRequest({
      clientId,
      clientName: "Example MCP Client",
      redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      scope: "mcp",
    });

    const consentUrl = new URL("http://localhost/mcp/consent");
    consentUrl.searchParams.set("response_type", "code");
    consentUrl.searchParams.set("client_id", clientId);
    consentUrl.searchParams.set("redirect_uri", redirectUri);
    consentUrl.searchParams.set("code_challenge", challenge);
    consentUrl.searchParams.set("code_challenge_method", "S256");

    const response = await app.request(consentUrl, {
      headers: {
        ...headers,
        cookie: `${MCP_AUTH_REQUEST_COOKIE}=${authRequest}`,
      },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Example MCP Client");
  });

  it("rejects authorization requests whose signed cookie would exceed browser limits", async () => {
    const clientId = `https://client.example/${"a".repeat(2_000)}`;
    const redirectUri = `https://client.example/callback?state=${"b".repeat(1_900)}`;

    resolveMcpClientMetadataMock.mockResolvedValue({
      ok: true,
      value: {
        clientId,
        clientName: "Example MCP Client",
        redirectUris: [redirectUri],
      },
    });

    const authorizeUrl = new URL("http://localhost/mcp/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("code_challenge", pkceChallenge("a".repeat(64)));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    const response = await app.request(authorizeUrl);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["canonical endpoint", "/mcp/sse"],
    ["compatibility alias", "/mcp/message"],
  ])("returns 405 for an authenticated GET to the $0", async (_label, endpoint) => {
    const headers = await authenticatedMcpHeaders();

    const response = await app.request(`http://localhost${endpoint}`, {
      method: "GET",
      headers,
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("closes the MCP server when POST handling fails", async () => {
    const headers = await authenticatedMcpHeaders();

    const handleRequestSpy = vi
      .spyOn(WebStandardStreamableHTTPServerTransport.prototype, "handleRequest")
      .mockRejectedValueOnce(new Error("transport failure"));

    const closeSpy = vi.spyOn(McpServer.prototype, "close");

    try {
      const response = await app.request("http://localhost/mcp/sse", {
        method: "POST",
        headers: {
          ...headers,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(response.status).toBe(500);
      expect(handleRequestSpy).toHaveBeenCalledOnce();
      expect(closeSpy).toHaveBeenCalledOnce();
    } finally {
      handleRequestSpy.mockRestore();
      closeSpy.mockRestore();
    }
  });

  it("closes the MCP server after a successful JSON POST response", async () => {
    const headers = await authenticatedMcpHeaders();
    const closeSpy = vi.spyOn(McpServer.prototype, "close");

    try {
      const response = await app.request("http://localhost/mcp/sse", {
        method: "POST",
        headers: {
          ...headers,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");

      await expect(response.json()).resolves.toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: {
          tools: expect.any(Array),
        },
      });

      expect(closeSpy).toHaveBeenCalledOnce();
    } finally {
      closeSpy.mockRestore();
    }
  });

  it("supports the stateless MCP POST lifecycle on the canonical endpoint", async () => {
    const headers = await authenticatedMcpHeaders();

    const postMcp = (message: unknown) =>
      app.request("http://localhost/mcp/sse", {
        method: "POST",
        headers: {
          ...headers,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify(message),
      });

    const initializeResponse = await postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: {
          name: "HL-608 integration test",
          version: "1.0.0",
        },
      },
    });

    expect(initializeResponse.status).toBe(200);
    await expect(initializeResponse.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-11-25",
      },
    });

    const initializedResponse = await postMcp({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });

    expect(initializedResponse.status).toBe(202);

    const toolsListResponse = await postMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    expect(toolsListResponse.status).toBe(200);
    await expect(toolsListResponse.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: expect.any(Array),
      },
    });

    const toolsCallResponse = await postMcp({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_projects",
        arguments: {
          limit: 1,
        },
      },
    });

    expect(toolsCallResponse.status).toBe(200);
    await expect(toolsCallResponse.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      result: {
        content: expect.any(Array),
      },
    });
  });

  it("keeps /mcp/message as a POST compatibility alias", async () => {
    const headers = await authenticatedMcpHeaders();

    const response = await app.request("http://localhost/mcp/message", {
      method: "POST",
      headers: {
        ...headers,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: expect.any(Array),
      },
    });
  });

  it("works with a real Streamable HTTP MCP client without GET reconnects or errors", async () => {
    const headers = await authenticatedMcpHeaders();

    const requestMethods: string[] = [];
    const transportErrors: Error[] = [];

    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp/sse"), {
      requestInit: {
        headers: {
          ...headers,
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
      },
      fetch: async (url, init) => {
        requestMethods.push(init?.method ?? "GET");
        return app.request(String(url), init);
      },
    });

    transport.onerror = (error) => {
      transportErrors.push(error);
    };

    const client = new Client(
      {
        name: "HL-608 integration test",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await client.connect(transport);

      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);

      const result = await client.callTool({
        name: "list_projects",
        arguments: {
          limit: 1,
        },
      });

      expect(result.content).toEqual(expect.any(Array));
      expect(requestMethods.filter((method) => method === "POST")).toHaveLength(4);
      expect(requestMethods.filter((method) => method === "GET")).toHaveLength(1);
      expect(requestMethods.every((method) => method === "POST" || method === "GET")).toBe(true);
      expect(transportErrors).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("preserves MCP protocol-version validation for POST requests", async () => {
    const headers = await authenticatedMcpHeaders();

    const response = await app.request("http://localhost/mcp/sse", {
      method: "POST",
      headers: {
        ...headers,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "unsupported-version",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(400);
  });
});
