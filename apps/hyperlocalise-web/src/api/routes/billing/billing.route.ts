import { Hono } from "hono";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { apiErrorResponse, forbiddenResponse } from "@/api/response.schema";
import { syncWorkspaceResourceUsageToAutumn } from "@/lib/billing/workspace-resource-usage-sync";
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
    })
    .post("/resource-usage/sync", async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "billing:write")) {
        return forbiddenResponse(
          c,
          "billing_write_forbidden",
          "Only workspace admins can sync billing usage",
        );
      }

      const syncResult = await syncWorkspaceResourceUsageToAutumn({
        organizationId: c.var.auth.organization.localOrganizationId,
      });

      if (syncResult.status === "partial_failed") {
        return apiErrorResponse(
          c,
          502,
          "billing_resource_usage_sync_partial_failed",
          "One or more billing resource usage features failed to sync",
          { syncResult },
        );
      }

      return c.json({ syncResult }, 200);
    });
}
