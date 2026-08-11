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

import { badRequestResponse, unauthorizedResponse } from "@/api/response.schema";
import { getWorkosAuthKitConfig } from "@/lib/workos/config";
import { isAllowedNativeRedirectUri } from "@/lib/workos/native-redirect";
import { getWorkosServerClient } from "@/lib/workos/server-client";

import { nativeAuthorizeQuerySchema, nativeTokenBodySchema } from "./native-auth.schema";

/**
 * Native AuthKit PKCE bridge for apps/mac-app.
 *
 * Authorize builds a WorkOS AuthKit URL for a client-generated PKCE challenge.
 * Token exchanges the authorization code for a sealed WorkOS session that the
 * Mac app stores in Keychain and sends as `Cookie: wos-session=…` — the same
 * channel used by the web app (see AUTH_INVARIANTS §9).
 */
export function createNativeAuthRoutes() {
  return new Hono()
    .get(
      "/authorize",
      validator("query", (value, c) => {
        const parsed = nativeAuthorizeQuerySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(c, "invalid_native_authorize_query");
        }
        return parsed.data;
      }),
      async (c) => {
        const query = c.req.valid("query");
        if (!isAllowedNativeRedirectUri(query.redirectUri)) {
          return badRequestResponse(c, "redirect_uri_not_allowed");
        }

        const config = getWorkosAuthKitConfig();
        const workos = getWorkosServerClient();
        if (!config || !workos) {
          return c.json({ error: "workos_not_configured" }, 503);
        }

        const authorizationUrl = workos.userManagement.getAuthorizationUrl({
          provider: "authkit",
          clientId: config.clientId,
          redirectUri: query.redirectUri,
          codeChallenge: query.codeChallenge,
          codeChallengeMethod: query.codeChallengeMethod,
          state: query.state,
          screenHint: query.screenHint,
        });

        return c.json(
          {
            authorization: {
              url: authorizationUrl,
              redirectUri: query.redirectUri,
            },
          },
          200,
        );
      },
    )
    .post(
      "/token",
      validator("json", (value, c) => {
        const parsed = nativeTokenBodySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(c, "invalid_native_token_payload");
        }
        return parsed.data;
      }),
      async (c) => {
        const body = c.req.valid("json");
        if (!isAllowedNativeRedirectUri(body.redirectUri)) {
          return badRequestResponse(c, "redirect_uri_not_allowed");
        }

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
                cookieName: "wos-session",
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
            },
            200,
          );
        } catch {
          return unauthorizedResponse(c, "native_token_exchange_failed");
        }
      },
    );
}

export const nativeAuthRoutes = createNativeAuthRoutes();
