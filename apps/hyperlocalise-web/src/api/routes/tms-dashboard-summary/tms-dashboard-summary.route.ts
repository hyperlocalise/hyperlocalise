import { Hono } from "hono";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { internalErrorResponse } from "@/api/response.schema";
import { getOrganizationTmsDashboardSummary } from "@/lib/providers/organization-tms-dashboard-summary";

export function createTmsDashboardSummaryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      try {
        const tmsDashboardSummary = await getOrganizationTmsDashboardSummary(
          c.var.auth.organization.localOrganizationId,
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
