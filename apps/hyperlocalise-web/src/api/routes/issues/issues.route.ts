import { Hono } from "hono";

import { hasCapability } from "@/api/auth/policy";
import { createZodValidator } from "@/api/errors";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { organizationIssueService } from "@/lib/projects/issue-sheet/organization-issue-service";

import { organizationIssuesQuerySchema } from "./issues.schema";

const validateOrganizationIssuesQuery = createZodValidator(
  "query",
  organizationIssuesQuerySchema,
  "invalid_organization_issues_query",
);

export function createOrganizationIssuesRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateOrganizationIssuesQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return c.json({ error: "forbidden" }, 403);
      }

      const query = c.req.valid("query");
      const result = await organizationIssueService.list(c.var.auth, query);
      return c.json(result, 200);
    });
}
