import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { cors } from "hono/cors";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { env } from "@/lib/env";
import { db, schema } from "@/lib/database";
import { and, eq } from "drizzle-orm";
import { mcpTransport } from "./mcp-transport";
import {
  createMcpSession,
  deleteAuthCode,
  deleteOAuthState,
  exchangeWorkosCode,
  generateAuthCode,
  generateCodeChallenge,
  getAuthCode,
  getOAuthState,
  refreshMcpSession,
  storeAuthCode,
  storeOAuthState,
  validateMcpToken,
  validateRefreshToken,
} from "./mcp-auth";

type McpVariables = {
  mcpAuth: AuthInfo;
};

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

const mcpAuthMiddleware = createMiddleware<{ Variables: McpVariables }>(async (c, next) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const session = await validateMcpToken(token);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }

  c.set("mcpAuth", {
    token,
    clientId: "mcp-client",
    scopes: ["mcp"],
    expiresAt: Math.floor(session.expiresAt.getTime() / 1000),
    extra: {
      userId: session.userId,
      organizationId: session.organizationId,
      sessionId: session.id,
    },
  });

  await next();
});

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isMcpEnabled(): boolean {
  return env.MCP_AUTH_ENABLED === "true";
}

function getBaseUrl(c: { req: { url: string } }): string {
  return new URL(c.req.url).origin;
}

// ---------------------------------------------------------------------------
// Route module
// ---------------------------------------------------------------------------

export function createMcpRoutes() {
  return (
    new Hono()
      .use("*", cors({ origin: "*" }))

      // -----------------------------------------------------------------------
      // OAuth Authorization Endpoint
      // -----------------------------------------------------------------------
      .get("/authorize", async (c) => {
        if (!isMcpEnabled()) {
          return c.json({ error: "mcp_disabled" }, 503);
        }

        const query = c.req.query();

        const redirectUri = query["redirect_uri"];
        const state = query["state"];
        const codeChallenge = query["code_challenge"];
        const codeChallengeMethod = query["code_challenge_method"] ?? "S256";

        if (!redirectUri || !state || !codeChallenge) {
          return c.json(
            { error: "invalid_request", error_description: "Missing required parameters" },
            400,
          );
        }

        if (codeChallengeMethod !== "S256") {
          return c.json(
            { error: "invalid_request", error_description: "Only S256 PKCE is supported" },
            400,
          );
        }

        const workosCodeVerifier = await storeOAuthState(state, codeChallenge, redirectUri);
        const workosCodeChallenge = generateCodeChallenge(workosCodeVerifier);

        const workosAuthorizeUrl = new URL("https://api.workos.com/user_management/authorize");
        workosAuthorizeUrl.searchParams.set("client_id", env.WORKOS_CLIENT_ID ?? "");
        workosAuthorizeUrl.searchParams.set("redirect_uri", `${getBaseUrl(c)}/api/mcp/callback`);
        workosAuthorizeUrl.searchParams.set("response_type", "code");
        workosAuthorizeUrl.searchParams.set("state", state);
        workosAuthorizeUrl.searchParams.set("code_challenge", workosCodeChallenge);
        workosAuthorizeUrl.searchParams.set("code_challenge_method", "S256");

        return c.redirect(workosAuthorizeUrl.toString(), 302);
      })

      // -----------------------------------------------------------------------
      // OAuth Callback
      // -----------------------------------------------------------------------
      .get("/callback", async (c) => {
        if (!isMcpEnabled()) {
          return c.json({ error: "mcp_disabled" }, 503);
        }

        const query = c.req.query();
        const code = query["code"];
        const state = query["state"];
        const error = query["error"];

        if (error) {
          return c.json({ error: "access_denied", error_description: error }, 400);
        }

        if (!code || !state) {
          return c.json(
            { error: "invalid_request", error_description: "Missing code or state" },
            400,
          );
        }

        const oauthState = await getOAuthState(state);
        if (!oauthState) {
          return c.json(
            { error: "invalid_request", error_description: "Invalid or expired state" },
            400,
          );
        }

        await deleteOAuthState(state);

        let workosResponse: Awaited<ReturnType<typeof exchangeWorkosCode>>;
        try {
          workosResponse = await exchangeWorkosCode(code, oauthState.workosCodeVerifier);
        } catch {
          return c.json(
            { error: "server_error", error_description: "WorkOS exchange failed" },
            500,
          );
        }

        const workosUserId = workosResponse.user.id;
        const workosOrganizationId = workosResponse.organization_id;

        if (!workosOrganizationId) {
          return c.json(
            { error: "access_denied", error_description: "No organization in WorkOS response" },
            403,
          );
        }

        // Resolve local user and organization
        const [localUser] = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.workosUserId, workosUserId))
          .limit(1);

        if (!localUser) {
          return c.json(
            { error: "access_denied", error_description: "User not found in workspace" },
            403,
          );
        }

        const [localOrg] = await db
          .select({ id: schema.organizations.id })
          .from(schema.organizations)
          .where(eq(schema.organizations.workosOrganizationId, workosOrganizationId))
          .limit(1);

        if (!localOrg) {
          return c.json(
            { error: "access_denied", error_description: "Organization not found in workspace" },
            403,
          );
        }

        // Verify membership
        const [membership] = await db
          .select({ id: schema.organizationMemberships.id })
          .from(schema.organizationMemberships)
          .where(
            and(
              eq(schema.organizationMemberships.userId, localUser.id),
              eq(schema.organizationMemberships.organizationId, localOrg.id),
            ),
          )
          .limit(1);

        if (!membership) {
          return c.json(
            {
              error: "access_denied",
              error_description: "User is not a member of this organization",
            },
            403,
          );
        }

        // Generate MCP auth code
        const authCode = generateAuthCode();
        await storeAuthCode(authCode, {
          userId: localUser.id,
          organizationId: localOrg.id,
          codeChallenge: oauthState.mcpCodeChallenge,
          redirectUri: oauthState.mcpRedirectUri,
        });

        const redirectUrl = new URL(oauthState.mcpRedirectUri);
        redirectUrl.searchParams.set("code", authCode);
        redirectUrl.searchParams.set("state", state);

        return c.redirect(redirectUrl.toString(), 302);
      })

      // -----------------------------------------------------------------------
      // OAuth Token Endpoint
      // -----------------------------------------------------------------------
      .post("/token", async (c) => {
        if (!isMcpEnabled()) {
          return c.json({ error: "mcp_disabled" }, 503);
        }

        const body = await c.req.json().catch(() => ({}));

        const grantType = body["grant_type"];

        if (grantType === "authorization_code") {
          const code = body["code"];
          const codeVerifier = body["code_verifier"];
          const redirectUri = body["redirect_uri"];

          if (!code || !codeVerifier || !redirectUri) {
            return c.json(
              { error: "invalid_request", error_description: "Missing required parameters" },
              400,
            );
          }

          const authCodeEntry = await getAuthCode(code);
          if (!authCodeEntry) {
            return c.json(
              { error: "invalid_grant", error_description: "Invalid or expired code" },
              400,
            );
          }

          await deleteAuthCode(code);

          if (authCodeEntry.redirectUri !== redirectUri) {
            return c.json(
              { error: "invalid_grant", error_description: "Redirect URI mismatch" },
              400,
            );
          }

          const codeChallenge = generateCodeChallenge(codeVerifier);
          if (codeChallenge !== authCodeEntry.codeChallenge) {
            return c.json(
              { error: "invalid_grant", error_description: "PKCE verification failed" },
              400,
            );
          }

          const session = await createMcpSession(
            authCodeEntry.userId,
            authCodeEntry.organizationId,
          );

          return c.json({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
            token_type: "Bearer",
            expires_in: env.MCP_TOKEN_LIFETIME_MINUTES * 60,
          });
        }

        if (grantType === "refresh_token") {
          const refreshToken = body["refresh_token"];

          if (!refreshToken) {
            return c.json(
              { error: "invalid_request", error_description: "Missing refresh_token" },
              400,
            );
          }

          const session = await validateRefreshToken(refreshToken);
          if (!session) {
            return c.json(
              { error: "invalid_grant", error_description: "Invalid refresh token" },
              400,
            );
          }

          const refreshed = await refreshMcpSession(session.id);

          return c.json({
            access_token: refreshed.accessToken,
            refresh_token: refreshed.refreshToken,
            token_type: "Bearer",
            expires_in: env.MCP_TOKEN_LIFETIME_MINUTES * 60,
          });
        }

        return c.json({ error: "unsupported_grant_type" }, 400);
      })

      // -----------------------------------------------------------------------
      // MCP Streamable HTTP Transport
      // -----------------------------------------------------------------------
      .all("/", mcpAuthMiddleware, async (c) => {
        if (!isMcpEnabled()) {
          return c.json({ error: "mcp_disabled" }, 503);
        }

        const authInfo = c.var.mcpAuth;
        return mcpTransport.handleRequest(c.req.raw, { authInfo });
      })
  );
}
