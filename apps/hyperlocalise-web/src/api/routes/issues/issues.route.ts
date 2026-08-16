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
import { createZodValidator } from "@/api/errors";
import { forbiddenResponse } from "@/api/response.schema";
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
        return forbiddenResponse(c, "forbidden");
      }

      const query = c.req.valid("query");
      const result = await organizationIssueService.list(c.var.auth, query);
      return c.json(result, 200);
    });
}
