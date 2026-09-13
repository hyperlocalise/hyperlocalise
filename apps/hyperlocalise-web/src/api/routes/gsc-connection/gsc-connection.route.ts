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
import { randomUUID } from "node:crypto";

import { Hono } from "hono";
import { validator } from "hono/validator";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import { normalizeUserOAuthReturnTo } from "@/api/routes/external-tms-provider-credential/normalize-user-oauth-return-to";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { env } from "@/lib/env";
import {
  deleteGscConnection,
  getGscConnection,
  isGscOAuthConfigured,
  listGscConnections,
} from "@/lib/gsc/connections";
import { GSC_GOOGLE_AUTH_URL, GSC_OAUTH_SCOPES } from "@/lib/gsc/constants";
import { createGscOAuthState, getGscOAuthStateSecret, getGscRedirectUri } from "@/lib/gsc/oauth-state";

import { authorizeGscConnectionQuerySchema } from "./gsc-connection.schema";

function canReadGsc(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "projects:read");
}

function canWriteGsc(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "projects:create");
}

export function createGscConnectionRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!canReadGsc(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const gscConnections = await listGscConnections({
        organizationId: c.var.auth.organization.localOrganizationId,
      });
      return c.json(
        {
          gscConnections,
          configured: isGscOAuthConfigured(),
        },
        200,
      );
    })
    .get(
      "/authorize",
      validator("query", (value, c) => {
        const parsed = authorizeGscConnectionQuerySchema.safeParse(value);
        if (!parsed.success) {
          return badRequestResponse(c, "invalid_gsc_authorize_query");
        }
        return parsed.data;
      }),
      async (c) => {
        if (!canWriteGsc(c.var.auth.membership.role)) {
          return forbiddenResponse(c);
        }
        if (!isGscOAuthConfigured()) {
          return c.json(
            {
              error: "gsc_not_configured",
              message: "Search Console OAuth is not configured.",
            },
            503,
          );
        }

        const organizationSlug = c.var.auth.organization.slug;
        const returnTo = normalizeUserOAuthReturnTo(
          c.req.valid("query").returnTo,
          organizationSlug,
        );
        const secret = getGscOAuthStateSecret();
        if (!secret) {
          return c.json(
            {
              error: "gsc_not_configured",
              message: "Search Console OAuth is not configured.",
            },
            503,
          );
        }

        const state = await createGscOAuthState({
          organizationSlug,
          returnTo,
          nonce: randomUUID(),
          secret,
        });
        const authorizeUrl = new URL(GSC_GOOGLE_AUTH_URL);
        authorizeUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
        authorizeUrl.searchParams.set("redirect_uri", getGscRedirectUri(c.req.url));
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("scope", GSC_OAUTH_SCOPES.join(" "));
        authorizeUrl.searchParams.set("access_type", "offline");
        authorizeUrl.searchParams.set("include_granted_scopes", "true");
        authorizeUrl.searchParams.set("prompt", "consent");
        authorizeUrl.searchParams.set("state", state);
        return c.redirect(authorizeUrl.toString());
      },
    )
    .delete("/", async (c) => {
      if (!canWriteGsc(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      const existing = await getGscConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
      });
      if (!existing) {
        return notFoundResponse(c, "gsc_connection_not_found");
      }

      await deleteGscConnection({
        organizationId: c.var.auth.organization.localOrganizationId,
      });
      serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.integrationConnected, {
        status: "deleted",
        source: "google-search-console",
      });
      return c.body(null, 204);
    });
}
