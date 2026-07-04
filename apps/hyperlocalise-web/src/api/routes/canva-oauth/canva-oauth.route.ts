import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { validator } from "hono/validator";
import { z } from "zod";

import {
  CANVA_AUTH_REQUEST_COOKIE,
  CANVA_CONSENT_COOKIE,
  createCanvaAuthorizationCode,
  createCanvaAuthorizationRequest,
  createCanvaConsentGrant,
  exchangeCanvaAuthorizationCode,
  isAllowedCanvaOAuthRedirectUri,
  isValidCanvaOAuthClient,
  parseCanvaAuthorizationRequest,
  parseCanvaConsentGrant,
  refreshCanvaOAuthToken,
  revokeCanvaOAuthToken,
} from "@/api/auth/canva-oauth";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";

const authorizationQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1).max(128),
  redirect_uri: z.url().max(2048),
  code_challenge: z.string().min(32).max(128),
  code_challenge_method: z.literal("S256"),
  scope: z.string().max(256).optional().default("canva.localize offline_access"),
  state: z.string().max(128).optional(),
});

const revokeRequestSchema = z.object({
  token: z.string().min(1).max(8192),
  token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
  client_id: z.string().min(1).max(128),
  client_secret: z.string().min(1).max(512).optional(),
});

const tokenRequestSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1).max(8192),
    redirect_uri: z.url().max(2048),
    client_id: z.string().min(1).max(128),
    code_verifier: z.string().min(43).max(128),
    client_secret: z.string().min(1).max(512).optional(),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1).max(8192),
    client_id: z.string().min(1).max(128),
    client_secret: z.string().min(1).max(512).optional(),
  }),
]);

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

function renderCanvaConsentPage(input: { approveAction: string }) {
  const escaped = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Connect Hyperlocalise to Canva</title>
  </head>
  <body>
    <main>
      <h1>Connect Hyperlocalise to Canva</h1>
      <p>Allow the Hyperlocalise Canva app to access your account so you can localize designs in your workspaces.</p>
      <form method="post" action="${escaped(input.approveAction)}">
        <button type="submit">Allow access</button>
      </form>
      <p><a href="/">Cancel</a></p>
    </main>
  </body>
</html>`;
}

async function readTokenRequestBody(request: Request) {
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

function readClientSecret(c: { req: { header: (name: string) => string | undefined } }) {
  const authorization = c.req.header("authorization");
  if (authorization?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
      const [, secret] = decoded.split(":", 2);
      return secret ?? null;
    } catch {
      return null;
    }
  }

  return null;
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

const validateAuthorizationQuery = validator("query", (value, c) => {
  const parsed = authorizationQuerySchema.safeParse(value);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }
  return parsed.data;
});

export function createCanvaOAuthRoutes(options: { apiBasePath?: string } = {}) {
  const apiBasePath = options.apiBasePath ?? "/api";

  return new Hono()
    .get("/oauth/canva/authorize", validateAuthorizationQuery, async (c) => {
      const query = c.req.valid("query");

      if (!isAllowedCanvaOAuthRedirectUri(query.redirect_uri)) {
        return c.json({ error: "invalid_redirect_uri" }, 400);
      }

      if (!isValidCanvaOAuthClient(query.client_id)) {
        return c.json({ error: "invalid_client" }, 400);
      }

      const authRequest = createCanvaAuthorizationRequest({
        clientId: query.client_id,
        redirectUri: query.redirect_uri,
        codeChallenge: query.code_challenge,
        codeChallengeMethod: query.code_challenge_method,
        scope: query.scope,
        state: query.state,
      });

      setCookie(c, CANVA_AUTH_REQUEST_COOKIE, authRequest, secureCookieOptions(15 * 60));

      const callbackUrl = new URL(`${apiBasePath}/oauth/canva/callback`, endpointOrigin(c));
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          callbackUrl.searchParams.set(key, String(value));
        }
      }

      const signInUrl = new URL("/auth/sign-in", endpointOrigin(c));
      signInUrl.searchParams.set("returnTo", `${callbackUrl.pathname}${callbackUrl.search}`);

      return c.redirect(signInUrl.toString(), 302);
    })
    .get("/oauth/canva/consent", validateAuthorizationQuery, async (c) => {
      const query = c.req.valid("query");
      const authRequestToken = getCookie(c, CANVA_AUTH_REQUEST_COOKIE);
      const authRequest = authRequestToken
        ? parseCanvaAuthorizationRequest(authRequestToken)
        : null;

      if (
        !authRequest ||
        authRequest.clientId !== query.client_id ||
        authRequest.redirectUri !== query.redirect_uri ||
        authRequest.codeChallenge !== query.code_challenge
      ) {
        return c.json({ error: "invalid_request" }, 400);
      }

      const auth = await resolveApiAuthContextFromSession({});
      if (!auth) {
        const requestUrl = new URL(c.req.url);
        const signInUrl = new URL("/auth/sign-in", endpointOrigin(c));
        signInUrl.searchParams.set("returnTo", `${requestUrl.pathname}${requestUrl.search}`);
        return c.redirect(signInUrl.toString(), 302);
      }

      const consentUrl = new URL(`${apiBasePath}/oauth/canva/consent`, endpointOrigin(c));
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          consentUrl.searchParams.set(key, String(value));
        }
      }

      return c.html(
        renderCanvaConsentPage({
          approveAction: `${consentUrl.pathname}${consentUrl.search}`,
        }),
        200,
      );
    })
    .post("/oauth/canva/consent", validateAuthorizationQuery, async (c) => {
      const query = c.req.valid("query");
      const authRequestToken = getCookie(c, CANVA_AUTH_REQUEST_COOKIE);
      const authRequest = authRequestToken
        ? parseCanvaAuthorizationRequest(authRequestToken)
        : null;

      if (
        !authRequest ||
        authRequest.clientId !== query.client_id ||
        authRequest.redirectUri !== query.redirect_uri ||
        authRequest.codeChallenge !== query.code_challenge
      ) {
        return c.json({ error: "invalid_request" }, 400);
      }

      const auth = await resolveApiAuthContextFromSession({});
      if (!auth) {
        return c.json({ error: "access_denied" }, 403);
      }

      const consentGrant = createCanvaConsentGrant({
        requestNonce: authRequest.nonce,
        userId: auth.user.localUserId,
      });
      setCookie(c, CANVA_CONSENT_COOKIE, consentGrant, secureCookieOptions(5 * 60));

      const callbackUrl = new URL(`${apiBasePath}/oauth/canva/callback`, endpointOrigin(c));
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          callbackUrl.searchParams.set(key, String(value));
        }
      }

      return c.redirect(callbackUrl.toString(), 302);
    })
    .get("/oauth/canva/callback", validateAuthorizationQuery, async (c) => {
      const query = c.req.valid("query");

      if (!isValidCanvaOAuthClient(query.client_id)) {
        return c.json({ error: "invalid_client" }, 400);
      }

      const authRequestToken = getCookie(c, CANVA_AUTH_REQUEST_COOKIE);
      const authRequest = authRequestToken
        ? parseCanvaAuthorizationRequest(authRequestToken)
        : null;

      if (
        !authRequest ||
        authRequest.clientId !== query.client_id ||
        authRequest.redirectUri !== query.redirect_uri ||
        authRequest.codeChallenge !== query.code_challenge
      ) {
        return c.json({ error: "invalid_request" }, 400);
      }

      const auth = await resolveApiAuthContextFromSession({});
      if (!auth) {
        const requestUrl = new URL(c.req.url);
        const signInUrl = new URL("/auth/sign-in", endpointOrigin(c));
        signInUrl.searchParams.set("returnTo", `${requestUrl.pathname}${requestUrl.search}`);
        return c.redirect(signInUrl.toString(), 302);
      }

      const consentToken = getCookie(c, CANVA_CONSENT_COOKIE);
      const consentGrant = consentToken ? parseCanvaConsentGrant(consentToken) : null;
      const hasValidConsent =
        consentGrant &&
        consentGrant.requestNonce === authRequest.nonce &&
        consentGrant.userId === auth.user.localUserId;

      if (!hasValidConsent) {
        const consentUrl = new URL(`${apiBasePath}/oauth/canva/consent`, endpointOrigin(c));
        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined) {
            consentUrl.searchParams.set(key, String(value));
          }
        }
        return c.redirect(consentUrl.toString(), 302);
      }

      deleteCookie(c, CANVA_AUTH_REQUEST_COOKIE, { path: "/" });
      deleteCookie(c, CANVA_CONSENT_COOKIE, { path: "/" });

      const code = createCanvaAuthorizationCode({
        clientId: query.client_id,
        redirectUri: query.redirect_uri,
        codeChallenge: query.code_challenge,
        codeChallengeMethod: query.code_challenge_method,
        scope: query.scope,
        state: query.state,
        userId: auth.user.localUserId,
      });

      const redirectUrl = new URL(query.redirect_uri);
      redirectUrl.searchParams.set("code", code);
      if (query.state) {
        redirectUrl.searchParams.set("state", query.state);
      }

      return c.redirect(redirectUrl.toString(), 302);
    })
    .post(
      "/oauth/canva/token",
      bodyLimit({
        maxSize: 256 * 1024,
        onError: (c) => c.json({ error: "payload_too_large" }, 413),
      }),
      async (c) => {
        const body = await readTokenRequestBody(c.req.raw);
        const parsed = tokenRequestSchema.safeParse({
          ...body,
          client_secret:
            typeof body.client_secret === "string"
              ? body.client_secret
              : (readClientSecret(c) ?? undefined),
        });

        if (!parsed.success) {
          return c.json({ error: "invalid_request" }, 400);
        }

        const clientSecret = parsed.data.client_secret ?? readClientSecret(c);

        if (!clientSecret || !isValidCanvaOAuthClient(parsed.data.client_id, clientSecret)) {
          return c.json({ error: "invalid_client" }, 401);
        }

        if (parsed.data.grant_type === "authorization_code") {
          const result = await exchangeCanvaAuthorizationCode({
            code: parsed.data.code,
            clientId: parsed.data.client_id,
            redirectUri: parsed.data.redirect_uri,
            codeVerifier: parsed.data.code_verifier,
          });

          if (!result.ok) {
            return c.json({ error: result.error }, 400);
          }

          return c.json(
            tokenResponse({
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              expiresIn: result.expiresIn,
              scope: result.scope,
            }),
            200,
          );
        }

        const result = await refreshCanvaOAuthToken({
          refreshToken: parsed.data.refresh_token,
          clientId: parsed.data.client_id,
        });

        if (!result.ok) {
          return c.json({ error: result.error }, 400);
        }

        return c.json(
          tokenResponse({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresIn: result.expiresIn,
            scope: result.scope,
          }),
          200,
        );
      },
    )
    .post(
      "/oauth/canva/revoke",
      bodyLimit({
        maxSize: 64 * 1024,
        onError: (c) => c.json({ error: "payload_too_large" }, 413),
      }),
      async (c) => {
        const body = await readTokenRequestBody(c.req.raw);
        const parsed = revokeRequestSchema.safeParse({
          ...body,
          client_secret:
            typeof body.client_secret === "string"
              ? body.client_secret
              : (readClientSecret(c) ?? undefined),
        });

        if (!parsed.success) {
          return c.json({ error: "invalid_request" }, 400);
        }

        const clientSecret = parsed.data.client_secret ?? readClientSecret(c);

        if (!clientSecret || !isValidCanvaOAuthClient(parsed.data.client_id, clientSecret)) {
          return c.json({ error: "invalid_client" }, 401);
        }

        await revokeCanvaOAuthToken(parsed.data.token);
        return c.body(null, 200);
      },
    );
}
