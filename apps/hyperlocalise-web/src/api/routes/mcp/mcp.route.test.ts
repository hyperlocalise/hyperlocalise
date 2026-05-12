import "dotenv/config";

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createAuthorizationCode, hashMcpToken } from "@/api/auth/mcp";
import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "../project/project.fixture";

const app = createApp();
const fixture = createProjectTestFixture();

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

describe("mcpRoutes", () => {
  afterEach(async () => {
    await fixture.cleanup();
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
      refreshTokenHash: hashMcpToken(body.refresh_token),
    });
  });
});
