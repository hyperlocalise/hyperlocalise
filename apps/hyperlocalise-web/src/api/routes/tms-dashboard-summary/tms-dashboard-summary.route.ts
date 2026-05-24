import { Hono } from "hono";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { getOrganizationTmsDashboardSummary } from "@/lib/providers/organization-tms-dashboard-summary";

export function createTmsDashboardSummaryRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const tmsDashboardSummary = await getOrganizationTmsDashboardSummary(
        c.var.auth.organization.localOrganizationId,
      );

      return c.json({ tmsDashboardSummary }, 200);
    });
}
