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

import {
  isIntegrationsReadAllowed,
  isProviderCredentialReadAllowed,
} from "@/api/auth/capability-guards";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { forbiddenResponse, internalErrorResponse } from "@/api/response.schema";
import { getOrganizationTmsDashboardSummary } from "@/lib/providers/jobs/organization-tms-dashboard-summary";

export function createTmsDashboardSummaryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      if (!isIntegrationsReadAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }

      try {
        const tmsDashboardSummary = await getOrganizationTmsDashboardSummary(
          c.var.auth.organization.localOrganizationId,
          {
            includeCredentialDetails: isProviderCredentialReadAllowed(c.var.auth.membership.role),
          },
        );

        return c.json({ tmsDashboardSummary }, 200);
      } catch {
        return internalErrorResponse(
          c,
          "tms_dashboard_summary_failed",
          "Failed to load TMS dashboard summary.",
        );
      }
    });
}
