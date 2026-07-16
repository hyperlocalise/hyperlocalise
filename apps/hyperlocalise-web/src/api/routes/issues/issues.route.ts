import { Hono } from "hono";

import { hasCapability } from "@/api/auth/policy";
import { createZodValidator } from "@/api/errors";
import { createWorkspaceFeatureFlagMiddleware } from "@/api/middleware/workspace-feature-flag";
import { forbiddenResponse } from "@/api/response.schema";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { workspaceIssuesFlag } from "@/lib/flags/workspace-flags";
import { organizationIssueService } from "@/lib/projects/issue-sheet/organization-issue-service";

import { organizationIssuesQuerySchema } from "./issues.schema";

const validateOrganizationIssuesQuery = createZodValidator(
  "query",
  organizationIssuesQuerySchema,
  "invalid_organization_issues_query",
);

const requireWorkspaceIssuesFeature = createWorkspaceFeatureFlagMiddleware(
  workspaceIssuesFlag,
  "Workspace issues is not enabled for this organization",
);

export function createOrganizationIssuesRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", requireWorkspaceIssuesFeature)
    .get("/", validateOrganizationIssuesQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const query = c.req.valid("query");
      const result = await organizationIssueService.list(c.var.auth, query);
      return c.json(result, 200);
    });
}
