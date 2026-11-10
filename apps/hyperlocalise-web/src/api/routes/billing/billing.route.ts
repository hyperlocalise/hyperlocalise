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
import { forbiddenResponse } from "@/api/response.schema";
import { getWorkspaceResourceUsage } from "@/lib/billing/workspace-resource-limits";

export function createBillingRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/resource-usage", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "billing:read")) {
        return forbiddenResponse(
          c,
          "billing_read_forbidden",
          "Billing settings require workspace admin access",
        );
      }

      const resourceUsage = await getWorkspaceResourceUsage({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      return c.json({ resourceUsage }, 200);
    });
}
