import { Hono } from "hono";

import { hasCapability } from "@/api/auth/policy";
import { createZodValidator } from "@/api/errors";
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

async function isWorkspaceIssuesFeatureEnabled(auth: AuthVariables["auth"]) {
  try {
    return (
      (await workspaceIssuesFlag.run({
        identify: () => ({
          organization: { id: auth.organization.workosOrganizationId },
          user: { id: auth.user.workosUserId },
        }),
      })) === true
    );
  } catch {
    return false;
  }
}

export function createOrganizationIssuesRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", async (c, next) => {
      const enabled = await isWorkspaceIssuesFeatureEnabled(c.var.auth);
      if (!enabled) {
        return forbiddenResponse(
          c,
          "feature_unavailable",
          "Workspace issues is not enabled for this organization",
        );
      }

      await next();
    })
    .get("/", validateOrganizationIssuesQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const query = c.req.valid("query");
      const result = await organizationIssueService.list(c.var.auth, query);
      return c.json(result, 200);
    });
}
