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

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { forbiddenResponse, serviceUnavailableResponse } from "@/api/response.schema";
import { getAhrefsPipesConnectionStatus } from "@/lib/ahrefs/pipes";
import { isErr } from "@/lib/primitives/result/results";

function canReadAhrefs(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "integrations:read");
}

export function createAhrefsPipesRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/ahrefs", async (c) => {
      if (!canReadAhrefs(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const result = await getAhrefsPipesConnectionStatus({
        localOrganizationId: c.var.auth.organization.localOrganizationId,
        workosUserId: c.var.auth.user.workosUserId,
      });

      if (isErr(result)) {
        return serviceUnavailableResponse(c, result.error.code, result.error.message);
      }

      return c.json({ ahrefsPipe: result.value }, 200);
    });
}
