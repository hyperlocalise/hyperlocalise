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
import { validator } from "hono/validator";

import { figmaCorsMiddleware } from "@/api/auth/figma-cors";
import { badRequestResponse, unauthorizedResponse } from "@/api/response.schema";
import { getWorkosAuthKitConfig } from "@/lib/workos/config";
import { getFigmaRedirectUri } from "@/lib/workos/figma-redirect";
import { getWorkosServerClient } from "@/lib/workos/server-client";

import { figmaAuthorizeQuerySchema, figmaTokenBodySchema } from "./figma-auth.schema";

/**
 * AuthKit PKCE for the Figma plugin popup.
 *
 * The redirect URI is server-chosen (`/auth/figma/callback`) so the plugin
 * cannot open-redirect. Token exchange returns the same sealed WorkOS session
 * used by the web and Mac apps (AUTH_INVARIANTS §9c).
 */
export function createFigmaAuthRoutes() {
  return new Hono()
    .use("*", figmaCorsMiddleware)
    .get(
      "/authorize",
      validator("query", (value, c) => {
        const parsed = figmaAuthorizeQuerySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(c, "invalid_figma_authorize_query");
        }
        return parsed.data;
      }),
      async (c) => {
        const query = c.req.valid("query");
        const redirectUri = getFigmaRedirectUri();

        const config = getWorkosAuthKitConfig();
        const workos = getWorkosServerClient();
        if (!config || !workos) {
          return c.json({ error: "workos_not_configured" }, 503);
        }

        const authorizationUrl = workos.userManagement.getAuthorizationUrl({
          provider: "authkit",
          clientId: config.clientId,
          redirectUri,
          codeChallenge: query.codeChallenge,
          codeChallengeMethod: query.codeChallengeMethod,
          state: query.state,
          screenHint: query.screenHint,
        });

        return c.json(
          {
            authorization: {
              url: authorizationUrl,
              redirectUri,
            },
          },
          200,
        );
      },
    )
    .post(
      "/token",
      validator("json", (value, c) => {
        const parsed = figmaTokenBodySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(c, "invalid_figma_token_payload");
        }
        return parsed.data;
      }),
      async (c) => {
        const body = c.req.valid("json");
        const redirectUri = getFigmaRedirectUri();

        const config = getWorkosAuthKitConfig();
        const workos = getWorkosServerClient();
        if (!config || !workos) {
          return c.json({ error: "workos_not_configured" }, 503);
        }

        try {
          const authResponse = await workos.userManagement.authenticateWithCode({
            clientId: config.clientId,
            code: body.code,
            codeVerifier: body.codeVerifier,
            session: {
              sealSession: true,
              cookiePassword: config.cookiePassword,
            },
          });

          const sealedSession = authResponse.sealedSession;
          if (!sealedSession) {
            return c.json({ error: "session_seal_failed" }, 502);
          }

          return c.json(
            {
              session: {
                sealedSession,
                headerName: "X-Hyperlocalise-Figma-Session",
              },
              user: {
                workosUserId: authResponse.user.id,
                email: authResponse.user.email,
                ...(authResponse.user.firstName ? { firstName: authResponse.user.firstName } : {}),
                ...(authResponse.user.lastName ? { lastName: authResponse.user.lastName } : {}),
                ...(authResponse.user.profilePictureUrl
                  ? { avatarUrl: authResponse.user.profilePictureUrl }
                  : {}),
              },
              ...(authResponse.organizationId
                ? { organizationId: authResponse.organizationId }
                : {}),
              redirectUri,
            },
            200,
          );
        } catch {
          return unauthorizedResponse(c, "figma_token_exchange_failed");
        }
      },
    );
}

export const figmaAuthRoutes = createFigmaAuthRoutes();
