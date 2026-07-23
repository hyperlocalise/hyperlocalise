import { Hono } from "hono";

import { hasCapability } from "@/api/auth/policy";
import { createZodValidator } from "@/api/errors";
import { createWorkspaceFeatureFlagMiddleware } from "@/api/middleware/workspace-feature-flag";
import { forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { workspaceIssuesFlag } from "@/lib/flags/workspace-flags";
import { organizationIssueService } from "@/lib/projects/issue-sheet/organization-issue-service";

import { organizationIssueSheetIssueParamsSchema } from "./issues.schema";

const validateIssueParams = createZodValidator(
  "param",
  organizationIssueSheetIssueParamsSchema,
  "invalid_issue_sheet_params",
);

const requireWorkspaceIssuesFeature = createWorkspaceFeatureFlagMiddleware(
  workspaceIssuesFlag,
  "Workspace issues is not enabled for this organization",
);

export function createOrganizationIssueSheetRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", requireWorkspaceIssuesFeature)
    .get("/:issueId", validateIssueParams, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const { issueId } = c.req.valid("param");
      const issue = await organizationIssueService.getById(c.var.auth, issueId);
      if (!issue) {
        return notFoundResponse(c, "issue_not_found", "Issue not found");
      }
      return c.json({ issue }, 200);
    });
}
