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
import { and, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";

import { createZodValidator } from "@/api/errors";
import { hasCapability } from "@/api/auth/policy";
import { buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { createWorkspaceFeatureFlagMiddleware } from "@/api/middleware/workspace-feature-flag";
import { forbiddenResponse } from "@/api/response.schema";
import { db, schema } from "@/lib/database";
import { workspaceIssuesFlag } from "@/lib/flags/workspace-flags";

import { mentionSuggestionsQuerySchema } from "./mention-suggestions.schema";

const requireWorkspaceIssuesFeature = createWorkspaceFeatureFlagMiddleware(
  workspaceIssuesFlag,
  "Workspace issues is not enabled for this organization",
);

const validateMentionSuggestionsQuery = createZodValidator(
  "query",
  mentionSuggestionsQuerySchema,
  "invalid_mention_suggestions_query",
);

function formatDisplayName(row: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return name || row.email;
}

function issueDisplayKey(input: { issueId: string; externalRef: string | null }) {
  if (input.externalRef?.trim()) {
    return input.externalRef.trim();
  }
  return input.issueId.replaceAll("-", "").slice(0, 8).toUpperCase();
}

export function createMentionSuggestionsRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", requireWorkspaceIssuesFeature)
    .get("/", validateMentionSuggestionsQuery, async (c) => {
      if (!hasCapability(c.var.auth.membership.role, "projects:read")) {
        return forbiddenResponse(c, "forbidden");
      }

      const query = c.req.valid("query");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const search = query.q.trim();
      const limit = query.limit;

      const memberConditions: SQL[] = [
        eq(schema.organizationMemberships.organizationId, organizationId),
      ];
      if (search) {
        const pattern = `%${search}%`;
        memberConditions.push(
          or(
            ilike(schema.users.email, pattern),
            ilike(schema.users.firstName, pattern),
            ilike(schema.users.lastName, pattern),
            sql`concat_ws(' ', ${schema.users.firstName}, ${schema.users.lastName}) ilike ${pattern}`,
          )!,
        );
      }

      const accessibleProjectsWhere = await buildAccessibleProjectsWhere(c.var.auth);
      const issueConditions: SQL[] = [
        eq(schema.issueSheetIssues.organizationId, organizationId),
        accessibleProjectsWhere,
      ];
      if (query.projectId) {
        issueConditions.push(eq(schema.issueSheetIssues.projectId, query.projectId));
      }
      if (query.issueId) {
        issueConditions.push(ne(schema.issueSheetIssues.id, query.issueId));
      }
      if (search) {
        const pattern = `%${search}%`;
        issueConditions.push(
          or(
            ilike(schema.issueSheetIssues.title, pattern),
            ilike(schema.issueSheetIssues.externalRef, pattern),
          )!,
        );
      }

      const [userRows, issueRows] = await Promise.all([
        db
          .select({
            userId: schema.users.id,
            firstName: schema.users.firstName,
            lastName: schema.users.lastName,
            email: schema.users.email,
            avatarUrl: schema.users.avatarUrl,
          })
          .from(schema.organizationMemberships)
          .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
          .where(and(...memberConditions))
          .orderBy(schema.users.firstName, schema.users.lastName, schema.users.email)
          .limit(limit),
        db
          .select({
            issueId: schema.issueSheetIssues.id,
            projectId: schema.issueSheetIssues.projectId,
            title: schema.issueSheetIssues.title,
            status: schema.issueSheetIssues.status,
            externalRef: schema.issueSheetIssues.externalRef,
          })
          .from(schema.issueSheetIssues)
          .innerJoin(schema.projects, eq(schema.issueSheetIssues.projectId, schema.projects.id))
          .where(and(...issueConditions, eq(schema.issueSheetIssues.projectId, schema.projects.id)))
          .orderBy(schema.issueSheetIssues.updatedAt)
          .limit(limit),
      ]);

      return c.json(
        {
          mentionSuggestions: {
            users: userRows.map((row) => ({
              userId: row.userId,
              displayName: formatDisplayName(row),
              avatarUrl: row.avatarUrl,
            })),
            issues: issueRows.map((row) => ({
              issueId: row.issueId,
              projectId: row.projectId,
              displayKey: issueDisplayKey(row),
              title: row.title,
              status: row.status,
            })),
          },
        },
        200,
      );
    });
}
