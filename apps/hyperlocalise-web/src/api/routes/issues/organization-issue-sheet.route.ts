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
import { forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { organizationIssueService } from "@/lib/projects/issue-sheet/organization-issue-service";

import { organizationIssueSheetIssueParamsSchema } from "./issues.schema";

const validateIssueParams = createZodValidator(
  "param",
  organizationIssueSheetIssueParamsSchema,
  "invalid_issue_sheet_params",
);

export function createOrganizationIssueSheetRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
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
