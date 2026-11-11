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
import { createMiddleware } from "hono/factory";

import { authErrorResponse, type AuthVariables } from "@/api/auth/workos";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { serviceUnavailableResponse, unauthorizedResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database/client";
import { verifyGoSvcServiceToken } from "@/lib/go-svc/go-svc-service-token";

export const GO_SVC_WORKOS_USER_HEADER = "x-hyperlocalise-workos-user-id";
export const GO_SVC_WORKOS_ORGANIZATION_HEADER = "x-hyperlocalise-workos-organization-id";

type DelegatedSession = NonNullable<
  NonNullable<Parameters<typeof resolveApiAuthContextFromSession>[0]>["session"]
>;

/**
 * Auth for requests go-svc forwards on a member's behalf. go-svc has already
 * verified the member's WorkOS access token and sends the server call token
 * with the verified WorkOS user (and organization) id. The member's auth
 * context is then resolved exactly as for a cookie session, so the same
 * membership, role and team checks apply.
 */
export function createGoSvcDelegatedAuthMiddleware() {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const service = verifyGoSvcServiceToken(c.req.raw);
    if (!service.ok) {
      return service.reason === "misconfigured"
        ? serviceUnavailableResponse(c, "go_svc_bridge_misconfigured")
        : unauthorizedResponse(c, "unauthorized", "missing server call token");
    }

    const workosUserId = c.req.header(GO_SVC_WORKOS_USER_HEADER)?.trim();
    if (!workosUserId) {
      return unauthorizedResponse(c, "unauthorized", "Authentication required");
    }
    const organizationSlug = c.req.param("organizationSlug") || undefined;

    try {
      const [user] = await db
        .select({
          email: schema.users.email,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          avatarUrl: schema.users.avatarUrl,
        })
        .from(schema.users)
        .where(eq(schema.users.workosUserId, workosUserId))
        .limit(1);
      if (!user) {
        throw new Error(organizationSlug ? "organization_access_denied" : "missing_auth_context");
      }

      const session = {
        user: {
          object: "user",
          id: workosUserId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePictureUrl: user.avatarUrl,
        },
        organizationId: c.req.header(GO_SVC_WORKOS_ORGANIZATION_HEADER)?.trim() || undefined,
      } as unknown as DelegatedSession;

      const auth = await resolveApiAuthContextFromSession({ session, organizationSlug });
      if (!auth) {
        throw new Error(organizationSlug ? "organization_access_denied" : "missing_auth_context");
      }
      c.set("auth", auth);
      c.get("log")?.set({
        auth: {
          organizationSlug,
          via: "go_svc_bridge",
          localUserId: auth.user.localUserId,
          localOrganizationId: auth.organization.localOrganizationId,
        },
      });
    } catch (error) {
      const response = authErrorResponse(c, error);
      if (response) return response;
      throw error;
    }

    await next();
  });
}

export const goSvcDelegatedAuthMiddleware = createGoSvcDelegatedAuthMiddleware();
