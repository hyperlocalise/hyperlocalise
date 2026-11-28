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

import { isIntegrationsReadAllowed } from "@/api/auth/capability-guards";
import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { forbiddenResponse, serviceUnavailableResponse } from "@/api/response.schema";
import { BITBUCKET_PIPES_SLUG } from "@/lib/bitbucket/constants";
import {
  createBitbucketAuthorizeUrl,
  disconnectBitbucket,
  getBitbucketConnectionStatus,
} from "@/lib/bitbucket/pipes";
import { isErr } from "@/lib/primitives/result/results";

/** Connecting Bitbucket changes what every project sync in the workspace reaches. */
function canManageBitbucket(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:write");
}

/**
 * The workspace's one shared Bitbucket connection, held by WorkOS Pipes as an organization-owned
 * account. An admin signs in once; project syncs use it with nobody signed in.
 */
export function createBitbucketRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/connection", async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }
      const result = await getBitbucketConnectionStatus({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosOrganizationId: c.var.auth.organization.workosOrganizationId,
      });
      if (isErr(result)) {
        return serviceUnavailableResponse(c, result.error.code, result.error.message);
      }
      return c.json({ bitbucketConnection: result.value }, 200);
    })
    .get("/connection/authorize-url", async (c) => {
      if (!canManageBitbucket(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }
      const organizationSlug = c.var.auth.organization.slug;
      const requestUrl = new URL(c.req.url);
      const result = await createBitbucketAuthorizeUrl({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
        ...(organizationSlug
          ? {
              returnTo: `${requestUrl.origin}/org/${organizationSlug}/integrations?pipesCallback=${BITBUCKET_PIPES_SLUG}`,
            }
          : {}),
      });
      if (isErr(result)) {
        return serviceUnavailableResponse(c, result.error.code, result.error.message);
      }
      return c.json({ url: result.value.url }, 200);
    })
    .delete("/connection", async (c) => {
      if (!canManageBitbucket(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }
      const result = await disconnectBitbucket({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });
      if (isErr(result)) {
        return serviceUnavailableResponse(c, result.error.code, result.error.message);
      }
      return c.body(null, 204);
    });
}
