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
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { hasCapability } from "@/api/auth/policy";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db, schema } from "@/lib/database/client";
import {
  exchangeGscAuthorizationCode,
  fetchGscAccount,
  upsertGscConnection,
} from "@/lib/gsc/connections";
import { getGscOAuthStateSecret, getGscRedirectUri, verifyGscOAuthState } from "@/lib/gsc/oauth-state";
import { isErr } from "@/lib/primitives/result/results";

function gscCallbackError(returnTo: string, error: string) {
  const url = new URL(returnTo, "https://app.hyperlocalise.local");
  url.searchParams.set("gscError", error);
  return `${url.pathname}${url.search}`;
}

export function createGscOAuthRoutes() {
  return new Hono().get("/callback", async (c) => {
    const fallback = "/dashboard?gscError=invalid_gsc_state";
    const stateParam = c.req.query("state");
    if (!stateParam) {
      return c.redirect(fallback);
    }

    const secret = getGscOAuthStateSecret();
    if (!secret) {
      return c.redirect("/dashboard?gscError=gsc_not_configured");
    }

    const verified = await verifyGscOAuthState(stateParam, secret);
    if (!verified) {
      return c.redirect(fallback);
    }

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, verified.organizationSlug))
      .limit(1);
    if (!org) {
      return c.redirect("/dashboard?gscError=organization_not_found");
    }

    const auth = await resolveApiAuthContextFromSession({
      cookie: c.req.header("cookie"),
      organizationSlug: org.slug ?? undefined,
    });
    const authOrganization = auth?.organizations.find(
      (item) => item.localOrganizationId === org.id,
    );
    if (!auth || !authOrganization) {
      return c.redirect("/dashboard?gscError=unauthorized");
    }
    if (!hasCapability(authOrganization.membership.role, "projects:create")) {
      return c.redirect(gscCallbackError(verified.returnTo, "forbidden"));
    }

    if (c.req.query("error")) {
      return c.redirect(gscCallbackError(verified.returnTo, "gsc_oauth_denied"));
    }

    const code = c.req.query("code");
    if (!code) {
      return c.redirect(gscCallbackError(verified.returnTo, "missing_gsc_code"));
    }

    const tokens = await exchangeGscAuthorizationCode({
      code,
      redirectUri: getGscRedirectUri(c.req.url),
    });
    if (isErr(tokens)) {
      return c.redirect(gscCallbackError(verified.returnTo, tokens.error.code));
    }

    const account = await fetchGscAccount({ accessToken: tokens.value.accessToken });
    if (isErr(account)) {
      return c.redirect(gscCallbackError(verified.returnTo, account.error.code));
    }

    await upsertGscConnection({
      organizationId: org.id,
      userId: auth.user.localUserId,
      googleSubject: account.value.googleSubject,
      accountEmail: account.value.accountEmail,
      refreshToken: tokens.value.refreshToken,
      accessToken: tokens.value.accessToken,
      accessTokenExpiresAt: tokens.value.expiresAt,
      scopes: tokens.value.scopes,
    });

    serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.integrationConnected, {
      status: "created",
      source: "google-search-console",
    });

    return c.redirect(verified.returnTo);
  });
}
