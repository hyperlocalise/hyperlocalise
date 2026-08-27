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
import { createMiddleware } from "hono/factory";

import { apiErrorResponse, forbiddenResponse, unauthorizedResponse } from "@/api/errors";
import { type AuthVariables, type ApiAuthContext } from "@/api/auth/workos";
import {
  OrganizationSlugUnresolvableError,
  StaleOrganizationSlugError,
  resolveApiAuthContextFromSession,
} from "@/api/auth/workos-session";

import { FIGMA_ORGANIZATION_SLUG_HEADER, FIGMA_SESSION_HEADER } from "./figma-cors";

function readFigmaSealedSession(c: { req: { header(name: string): string | undefined } }) {
  const headerToken = c.req.header(FIGMA_SESSION_HEADER)?.trim();
  if (headerToken) {
    return headerToken;
  }

  const authorization = c.req.header("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim();
    if (token.length > 0 && !token.startsWith("hlce_")) {
      return token;
    }
  }

  return null;
}

/**
 * Figma plugin UI cannot attach the WorkOS cookie, so it sends the same sealed
 * session via `X-Hyperlocalise-Figma-Session`. Verification still goes through
 * `resolveApiAuthContextFromSession` — this is not a separate identity channel.
 */
export const figmaSessionAuthMiddleware = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  try {
    const organizationSlug =
      c.req.header(FIGMA_ORGANIZATION_SLUG_HEADER) ||
      c.req.header("x-hyperlocalise-organization-slug") ||
      new URL(c.req.url).searchParams.get("organizationSlug") ||
      undefined;

    const sealedSession = readFigmaSealedSession(c);
    if (!sealedSession) {
      throw new Error("missing_auth_context");
    }

    const authFromSession = await resolveApiAuthContextFromSession({
      cookie: `wos-session=${sealedSession}`,
      organizationSlug,
    });
    if (!authFromSession) {
      if (organizationSlug) {
        throw new Error("organization_access_denied");
      }
      throw new Error("missing_auth_context");
    }

    c.set("auth", authFromSession);
    c.get("log").set({
      auth: {
        organizationSlug,
        localUserId: authFromSession.user.localUserId,
        localOrganizationId: authFromSession.organization.localOrganizationId,
        channel: "figma_plugin",
      },
    });
  } catch (error) {
    if (error instanceof StaleOrganizationSlugError) {
      return apiErrorResponse(c, 403, "stale_organization_slug", "Organization slug changed", {
        requestedSlug: error.requestedSlug,
        currentSlug: error.currentSlug,
      });
    }

    if (error instanceof OrganizationSlugUnresolvableError) {
      return forbiddenResponse(
        c,
        "organization_slug_unresolvable",
        "Organization slug is unavailable; choose another workspace",
      );
    }

    const message = error instanceof Error ? error.message : "unauthorized";

    if (message === "missing_auth_context") {
      return unauthorizedResponse(c, "unauthorized", "Authentication required");
    }

    if (message === "archived_organization_access") {
      return forbiddenResponse(c, "workspace_archived", "This workspace has been archived");
    }

    if (message === "organization_access_denied") {
      return forbiddenResponse(c, "organization_access_denied", "Organization access denied");
    }

    if (message === "workos_membership_lookup_failed") {
      return forbiddenResponse(
        c,
        "workos_membership_lookup_failed",
        "Organization membership could not be verified",
      );
    }

    throw error;
  }

  await next();
});

export type FigmaSessionAuth = ApiAuthContext;
