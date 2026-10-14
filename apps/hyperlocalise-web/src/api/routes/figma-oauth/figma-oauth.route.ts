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
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { validator } from "hono/validator";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

import { hasCapability } from "@/api/auth/policy";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { badRequestResponse } from "@/api/response.schema";
import {
  authenticateFigmaOauthClient,
  buildFigmaOauthRedirect,
  FIGMA_OAUTH_REQUEST_COOKIE,
  FIGMA_OAUTH_SCOPE,
  consumeFigmaOauthAuthorizationCode,
  createFigmaOauthAuthorizationCode,
  createFigmaOauthAuthorizationRequest,
  getFigmaOauthRedirectAllowlist,
  isAllowedFigmaOauthRedirectUri,
  isFigmaOauthConfigured,
  issueFigmaOauthTokens,
  listFigmaOauthConsentConnections,
  parseFigmaOauthAuthorizationRequest,
  refreshFigmaOauthTokens,
  revokeFigmaOauthToken,
} from "@/lib/figma/oauth";
import { env } from "@/lib/env";

const authorizationQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1).max(2048),
  redirect_uri: z.url().max(2048),
  code_challenge: z.string().min(32).max(128),
  code_challenge_method: z.literal("S256"),
  scope: z.string().max(128).optional().default(FIGMA_OAUTH_SCOPE),
  state: z.string().max(512).optional(),
});

const consentBodySchema = z.object({
  connectionId: z.string().uuid(),
});

const tokenRequestSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1).max(8192),
    redirect_uri: z.url().max(2048),
    code_verifier: z.string().min(43).max(128),
    client_id: z.string().min(1).max(2048).optional(),
    client_secret: z.string().min(1).max(2048).optional(),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1).max(8192),
    client_id: z.string().min(1).max(2048).optional(),
    client_secret: z.string().min(1).max(2048).optional(),
  }),
]);

const revokeRequestSchema = z.object({
  token: z.string().min(1).max(8192),
  token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
  client_id: z.string().min(1).max(2048).optional(),
  client_secret: z.string().min(1).max(2048).optional(),
});

function endpointOrigin(c: { req: { url: string } }) {
  return new URL(c.req.url).origin;
}

function secureCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

async function readFormOrJsonBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }

  try {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  } catch {
    return {};
  }
}

function oauthError(
  c: Parameters<typeof badRequestResponse>[0],
  error: string,
  status: ContentfulStatusCode = 400,
) {
  return c.json({ error }, status);
}

function tokenResponse(input: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}) {
  return {
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    token_type: "Bearer",
    expires_in: input.expiresIn,
    scope: input.scope,
  };
}

function consentPagePath() {
  const publicAppUrl = env.HYPERLOCALISE_PUBLIC_APP_URL;
  if (publicAppUrl) {
    return new URL("/en/connect/figma/oauth", publicAppUrl).pathname;
  }

  return "/en/connect/figma/oauth";
}

const validateAuthorizationQuery = validator("query", (value, c) => {
  const parsed = authorizationQuerySchema.safeParse(value);
  if (!parsed.success) {
    return oauthError(c, "invalid_request");
  }

  return parsed.data;
});

export function getFigmaOauthAuthorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/figma/authorize`,
    token_endpoint: `${origin}/api/oauth/figma/token`,
    revocation_endpoint: `${origin}/api/oauth/figma/revoke`,
    scopes_supported: [FIGMA_OAUTH_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    redirect_uris: getFigmaOauthRedirectAllowlist(),
  };
}

export function createFigmaOauthRoutes(): Hono {
  return new Hono()
    .get("/.well-known/oauth-authorization-server", (c) =>
      c.json(getFigmaOauthAuthorizationServerMetadata(endpointOrigin(c)), 200),
    )
    .get("/authorize", validateAuthorizationQuery, async (c) => {
      if (!isFigmaOauthConfigured()) {
        return c.json({ error: "figma_oauth_unconfigured" }, 503);
      }

      const query = c.req.valid("query");
      if (query.client_id !== env.FIGMA_OAUTH_CLIENT_ID) {
        return oauthError(c, "invalid_client");
      }

      if (!isAllowedFigmaOauthRedirectUri(query.redirect_uri)) {
        return oauthError(c, "invalid_redirect_uri");
      }

      const authRequest = createFigmaOauthAuthorizationRequest({
        clientId: query.client_id,
        redirectUri: query.redirect_uri,
        codeChallenge: query.code_challenge,
        codeChallengeMethod: query.code_challenge_method,
        scope: query.scope,
        state: query.state,
      });
      setCookie(c, FIGMA_OAUTH_REQUEST_COOKIE, authRequest, secureCookieOptions(15 * 60));

      const origin = endpointOrigin(c);
      const auth = await resolveApiAuthContextFromSession();
      const consentPath = consentPagePath();
      if (!auth) {
        const signInUrl = new URL("/auth/sign-in", origin);
        signInUrl.searchParams.set("returnTo", consentPath);
        return c.redirect(signInUrl.toString(), 302);
      }

      return c.redirect(new URL(consentPath, origin).toString(), 302);
    })
    .post("/consent", async (c) => {
      if (!isFigmaOauthConfigured()) {
        return c.json({ error: "figma_oauth_unconfigured" }, 503);
      }

      const authRequestToken = getCookie(c, FIGMA_OAUTH_REQUEST_COOKIE);
      const authRequest = authRequestToken
        ? parseFigmaOauthAuthorizationRequest(authRequestToken)
        : null;
      if (!authRequest) {
        return oauthError(c, "invalid_request");
      }

      const parsedBody = consentBodySchema.safeParse(await readFormOrJsonBody(c.req.raw));
      if (!parsedBody.success) {
        return c.redirect(
          buildFigmaOauthRedirect({
            redirectUri: authRequest.redirectUri,
            state: authRequest.state,
            error: "invalid_request",
            errorDescription: "A Figma connection is required.",
          }),
          302,
        );
      }

      const auth = await resolveApiAuthContextFromSession();
      if (!auth) {
        const signInUrl = new URL("/auth/sign-in", endpointOrigin(c));
        signInUrl.searchParams.set("returnTo", consentPagePath());
        return c.redirect(signInUrl.toString(), 302);
      }

      const connections = await listFigmaOauthConsentConnections(auth.user.localUserId);
      const connection = connections.find(
        (candidate) => candidate.connectionId === parsedBody.data.connectionId,
      );
      if (!connection?.enabled) {
        return c.redirect(
          buildFigmaOauthRedirect({
            redirectUri: authRequest.redirectUri,
            state: authRequest.state,
            error: "access_denied",
            errorDescription: "The selected Figma connection is unavailable.",
          }),
          302,
        );
      }

      if (!hasCapability(connection.role, "provider_credentials:write")) {
        return c.redirect(
          buildFigmaOauthRedirect({
            redirectUri: authRequest.redirectUri,
            state: authRequest.state,
            error: "access_denied",
            errorDescription: "You need permission to connect Figma to this workspace.",
          }),
          302,
        );
      }

      const code = await createFigmaOauthAuthorizationCode({
        clientId: authRequest.clientId,
        redirectUri: authRequest.redirectUri,
        codeChallenge: authRequest.codeChallenge,
        userId: auth.user.localUserId,
        organizationId: connection.organizationId,
        connectionId: connection.connectionId,
      });
      deleteCookie(c, FIGMA_OAUTH_REQUEST_COOKIE, { path: "/" });
      return c.redirect(
        buildFigmaOauthRedirect({
          redirectUri: authRequest.redirectUri,
          state: authRequest.state,
          code,
        }),
        302,
      );
    })
    .post("/deny", async (c) => {
      const authRequestToken = getCookie(c, FIGMA_OAUTH_REQUEST_COOKIE);
      const authRequest = authRequestToken
        ? parseFigmaOauthAuthorizationRequest(authRequestToken)
        : null;
      deleteCookie(c, FIGMA_OAUTH_REQUEST_COOKIE, { path: "/" });
      if (!authRequest) {
        return oauthError(c, "invalid_request");
      }

      return c.redirect(
        buildFigmaOauthRedirect({
          redirectUri: authRequest.redirectUri,
          state: authRequest.state,
          error: "access_denied",
          errorDescription: "The user denied the request.",
        }),
        302,
      );
    })
    .post("/token", async (c) => {
      if (!isFigmaOauthConfigured()) {
        return c.json({ error: "figma_oauth_unconfigured" }, 503);
      }

      const parsed = tokenRequestSchema.safeParse(await readFormOrJsonBody(c.req.raw));
      if (!parsed.success) {
        return oauthError(c, "invalid_request");
      }

      if (
        !authenticateFigmaOauthClient({
          authorizationHeader: c.req.header("authorization"),
          clientId: parsed.data.client_id,
          clientSecret: parsed.data.client_secret,
        })
      ) {
        return oauthError(c, "invalid_client", 401);
      }

      if (parsed.data.grant_type === "authorization_code") {
        const consumed = await consumeFigmaOauthAuthorizationCode({
          code: parsed.data.code,
          clientId: env.FIGMA_OAUTH_CLIENT_ID ?? "",
          redirectUri: parsed.data.redirect_uri,
          codeVerifier: parsed.data.code_verifier,
        });
        if (!consumed) {
          return oauthError(c, "invalid_grant");
        }

        const tokens = await issueFigmaOauthTokens({
          connectionId: consumed.connectionId,
          userId: consumed.userId,
          organizationId: consumed.organizationId,
        });
        return c.json(tokenResponse(tokens), 200);
      }

      const tokens = await refreshFigmaOauthTokens(parsed.data.refresh_token);
      if (!tokens) {
        return oauthError(c, "invalid_grant");
      }

      return c.json(tokenResponse(tokens), 200);
    })
    .post("/revoke", async (c) => {
      if (!isFigmaOauthConfigured()) {
        return c.json({ error: "figma_oauth_unconfigured" }, 503);
      }

      const parsed = revokeRequestSchema.safeParse(await readFormOrJsonBody(c.req.raw));
      if (!parsed.success) {
        return oauthError(c, "invalid_request");
      }

      if (
        !authenticateFigmaOauthClient({
          authorizationHeader: c.req.header("authorization"),
          clientId: parsed.data.client_id,
          clientSecret: parsed.data.client_secret,
        })
      ) {
        return oauthError(c, "invalid_client", 401);
      }

      await revokeFigmaOauthToken(parsed.data.token);
      return c.body(null, 200);
    });
}
