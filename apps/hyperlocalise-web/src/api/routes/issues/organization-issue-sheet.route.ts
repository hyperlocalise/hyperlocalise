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
import { and, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";

import { hasCapability } from "@/api/auth/policy";
import { createZodValidator } from "@/api/errors";
import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { db, schema } from "@/lib/database/client";
import { organizationIssueService } from "@/lib/projects/issue-sheet/organization-issue-service";

import {
  organizationIssueSearchQuerySchema,
  organizationIssueSheetIssueParamsSchema,
} from "./issues.schema";

const validateIssueParams = createZodValidator(
  "param",
  organizationIssueSheetIssueParamsSchema,
  "invalid_issue_sheet_params",
);

const validateIssueSearchQuery = createZodValidator(
  "query",
  organizationIssueSearchQuerySchema,
  "invalid_issue_search_query",
);

export function createOrganizationIssueSheetRoutes() {
  return (
    new Hono<{ Variables: AuthVariables }>()
      .use("*", workosAuthMiddleware)
      // Registered before "/:issueId" — a later registration here would be
      // swallowed as issueId="search", since Hono matches in registration order.
      .get("/search", validateIssueSearchQuery, async (c) => {
        if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
          return forbiddenResponse(c, "forbidden");
        }

        const query = c.req.valid("query");
        const organizationId = c.var.auth.organization.localOrganizationId;
        const accessibleProjectsWhere = await buildAccessibleProjectsWhere(c.var.auth);

        const conditions: SQL[] = [
          eq(schema.issueSheetIssues.organizationId, organizationId),
          accessibleProjectsWhere,
        ];
        if (query.excludeIssueId) {
          conditions.push(ne(schema.issueSheetIssues.id, query.excludeIssueId));
        }
        if (query.q) {
          const pattern = `%${query.q}%`;
          conditions.push(
            or(
              ilike(schema.issueSheetIssues.title, pattern),
              ilike(schema.issueSheetIssues.externalRef, pattern),
            )!,
          );
        }

        const rows = await db
          .select({
            issueId: schema.issueSheetIssues.id,
            projectId: schema.issueSheetIssues.projectId,
            title: schema.issueSheetIssues.title,
            status: schema.issueSheetIssues.status,
          })
          .from(schema.issueSheetIssues)
          .innerJoin(schema.projects, eq(schema.issueSheetIssues.projectId, schema.projects.id))
          .where(and(...conditions))
          // Most recently touched first — this is the primary picker result set,
          // and an empty query would otherwise surface the org's stalest issues.
          .orderBy(desc(schema.issueSheetIssues.updatedAt))
          .limit(query.limit);

        return c.json({ issues: rows }, 200);
      })
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
      })
  );
}
