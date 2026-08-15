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

import { createZodValidator } from "@/api/errors";
import type { AuthVariables } from "@/api/auth/workos";
import {
  isProjectMutationAllowed,
  isWriteBackTranslationAllowed,
} from "@/api/auth/capability-guards";
import { badRequestResponse, conflictResponse, notFoundResponse } from "@/api/response.schema";
import { createWorkspaceFeatureFlagMiddleware } from "@/api/middleware/workspace-feature-flag";
import { workspaceIssuesFlag } from "@/lib/flags/workspace-flags";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";

import { createIssueSheetCommentRoutes } from "./issue-sheet-comments.route";
import {
  issueSheetColumnParamsSchema,
  issueSheetCreateColumnBodySchema,
  issueSheetCreateIssueBodySchema,
  issueSheetImportBodySchema,
  issueSheetIssueParamsSchema,
  issueSheetParamsSchema,
  issueSheetQuerySchema,
  issueSheetFeedQuerySchema,
  issueSheetReorderColumnsBodySchema,
  issueSheetSetValueBodySchema,
  issueSheetTemplateConfigBodySchema,
  issueSheetUpdateColumnBodySchema,
  issueSheetUpdateIssueBodySchema,
} from "./issue-sheet.schema";
import {
  getOwnedProject,
  projectForbiddenResponse,
  projectNotFoundResponse,
} from "./project.shared";

const service = new IssueSheetService();

const validateIssueSheetParams = createZodValidator(
  "param",
  issueSheetParamsSchema,
  "invalid_issue_sheet_params",
);
const validateIssueSheetIssueParams = createZodValidator(
  "param",
  issueSheetIssueParamsSchema,
  "invalid_issue_sheet_params",
);
const validateIssueSheetColumnParams = createZodValidator(
  "param",
  issueSheetColumnParamsSchema,
  "invalid_issue_sheet_params",
);
const validateIssueSheetQuery = createZodValidator(
  "query",
  issueSheetQuerySchema,
  "invalid_issue_sheet_query",
);
const validateCreateIssueBody = createZodValidator(
  "json",
  issueSheetCreateIssueBodySchema,
  "invalid_issue_sheet_issue_payload",
);
const validateUpdateIssueBody = createZodValidator(
  "json",
  issueSheetUpdateIssueBodySchema,
  "invalid_issue_sheet_issue_payload",
);
const validateCreateColumnBody = createZodValidator(
  "json",
  issueSheetCreateColumnBodySchema,
  "invalid_issue_sheet_column_payload",
);
const validateUpdateColumnBody = createZodValidator(
  "json",
  issueSheetUpdateColumnBodySchema,
  "invalid_issue_sheet_column_payload",
);
const validateReorderColumnsBody = createZodValidator(
  "json",
  issueSheetReorderColumnsBodySchema,
  "invalid_issue_sheet_column_order_payload",
);
const validateSetValueBody = createZodValidator(
  "json",
  issueSheetSetValueBodySchema,
  "invalid_issue_sheet_value_payload",
);
const validateImportBody = createZodValidator(
  "json",
  issueSheetImportBodySchema,
  "invalid_issue_sheet_import_payload",
);
const validateTemplateConfigBody = createZodValidator(
  "json",
  issueSheetTemplateConfigBodySchema,
  "invalid_issue_sheet_template_config_payload",
);
const validateFeedQuery = createZodValidator(
  "query",
  issueSheetFeedQuerySchema,
  "invalid_issue_sheet_feed_query",
);

const requireWorkspaceIssuesFeature = createWorkspaceFeatureFlagMiddleware(
  workspaceIssuesFlag,
  "Workspace issues is not enabled for this organization",
);

async function requireProject(c: { var: { auth: AuthVariables["auth"] } }, projectId: string) {
  const project = await getOwnedProject(c.var.auth, projectId);
  if (!project) {
    return null;
  }
  return project;
}

export function createIssueSheetRoutes() {
  return (
    new Hono<{ Variables: AuthVariables }>()
      .use("*", requireWorkspaceIssuesFeature)
      .route("/:issueId/comments", createIssueSheetCommentRoutes())
      .get("/", validateIssueSheetParams, validateIssueSheetQuery, async (c) => {
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const result = await service.listIssues({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: project.id,
          actorUserId: c.var.auth.user.localUserId,
          query: c.req.valid("query"),
        });
        return c.json(result, 200);
      })
      .get("/assignable-members", validateIssueSheetParams, async (c) => {
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const members = await service.listAssignableMembers({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: project.id,
          actorUserId: c.var.auth.user.localUserId,
        });
        return c.json({ members }, 200);
      })
      .get("/columns", validateIssueSheetParams, async (c) => {
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const columns = await service.listColumns({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: project.id,
          actorUserId: c.var.auth.user.localUserId,
        });
        return c.json({ columns }, 200);
      })
      // No extra capability gate, matching /columns above: translators and reviewers hold
      // write_back:translation but not projects:write, and they are the primary users of the
      // project's default template.
      .get("/template-config", validateIssueSheetParams, async (c) => {
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const templateConfig = await service.getTemplateConfig({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: project.id,
        });
        return c.json({ templateConfig }, 200);
      })
      .put("/template-config", validateIssueSheetParams, validateTemplateConfigBody, async (c) => {
        if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
          return projectForbiddenResponse(c);
        }
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        try {
          const templateConfig = await service.setTemplateConfig({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            body: c.req.valid("json"),
          });
          return c.json({ templateConfig }, 200);
        } catch (error) {
          if (error instanceof Error && error.message === "assignee_not_assignable") {
            return badRequestResponse(
              c,
              "assignee_not_assignable",
              "Assignee must be an active workspace member with project access",
            );
          }
          throw error;
        }
      })
      .post("/columns", validateIssueSheetParams, validateCreateColumnBody, async (c) => {
        if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
          return projectForbiddenResponse(c);
        }
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        try {
          const column = await service.createColumn({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            actorUserId: c.var.auth.user.localUserId,
            body: c.req.valid("json"),
          });
          return c.json({ column }, 201);
        } catch (error) {
          if (error instanceof Error && error.message.includes("duplicate")) {
            return conflictResponse(c, "issue_sheet_column_exists", "Column already exists");
          }
          throw error;
        }
      })
      .put("/columns/order", validateIssueSheetParams, validateReorderColumnsBody, async (c) => {
        if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
          return projectForbiddenResponse(c);
        }
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        try {
          const columns = await service.reorderColumns({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            columnIds: c.req.valid("json").columnIds,
          });
          return c.json({ columns }, 200);
        } catch (error) {
          if (error instanceof Error && error.message === "issue_sheet_column_order_mismatch") {
            return badRequestResponse(
              c,
              "issue_sheet_column_order_mismatch",
              "Column order must include every project column exactly once",
            );
          }
          throw error;
        }
      })
      .post("/import", validateIssueSheetParams, validateImportBody, async (c) => {
        if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
          return projectForbiddenResponse(c);
        }
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        try {
          const result = await service.importFromCsv({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            actorUserId: c.var.auth.user.localUserId,
            body: c.req.valid("json"),
          });
          return c.json({ import: result }, result.dryRun ? 200 : 201);
        } catch (error) {
          if (error instanceof Error) {
            if (error.message === "issue_sheet_import_missing_title_mapping") {
              return badRequestResponse(
                c,
                "missing_required_mapping",
                "Map at least one column to Title",
              );
            }
            if (error.message === "issue_sheet_import_empty_csv") {
              return badRequestResponse(c, "invalid_csv", "CSV file is empty");
            }
            if (error.message === "issue_sheet_import_file_too_large") {
              return badRequestResponse(c, "invalid_csv", "CSV file is too large");
            }
            if (error.message === "issue_sheet_import_too_many_rows") {
              return badRequestResponse(c, "invalid_csv", "CSV has too many rows");
            }
            if (error.message === "issue_sheet_import_too_many_new_columns") {
              return badRequestResponse(
                c,
                "invalid_issue_sheet_import_payload",
                "Too many new columns requested",
              );
            }
          }
          throw error;
        }
      })
      .get("/:issueId/feed", validateIssueSheetIssueParams, validateFeedQuery, async (c) => {
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        try {
          const query = c.req.valid("query");
          const result = await service.listFeed({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            issueId: params.issueId,
            actorUserId: c.var.auth.user.localUserId,
            role: c.var.auth.membership.role,
            limit: query.limit,
            cursor: query.cursor,
          });
          return c.json(result, 200);
        } catch (error) {
          if (error instanceof Error && error.message === "issue_sheet_issue_not_found") {
            return notFoundResponse(c, "issue_not_found", "Issue not found");
          }
          if (error instanceof Error && error.message === "invalid_issue_sheet_feed_cursor") {
            return badRequestResponse(c, "invalid_issue_sheet_feed_cursor", "Invalid feed cursor");
          }
          throw error;
        }
      })
      .get("/:issueId", validateIssueSheetIssueParams, async (c) => {
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const issue = await service.getIssue({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: project.id,
          issueId: params.issueId,
          actorUserId: c.var.auth.user.localUserId,
        });
        if (!issue) {
          return notFoundResponse(c, "issue_not_found", "Issue not found");
        }
        return c.json({ issue }, 200);
      })
      .get("/:issueId/subscriptions", validateIssueSheetIssueParams, async (c) => {
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const subscribers = await service.listIssueSubscribers({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: project.id,
          issueId: params.issueId,
          actorUserId: c.var.auth.user.localUserId,
        });
        if (!subscribers) {
          return notFoundResponse(c, "issue_not_found", "Issue not found");
        }
        return c.json({ subscribers }, 200);
      })
      .post("/:issueId/subscription", validateIssueSheetIssueParams, async (c) => {
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const subscription = await service.watchIssue({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: project.id,
          issueId: params.issueId,
          actorUserId: c.var.auth.user.localUserId,
        });
        if (!subscription) {
          return notFoundResponse(c, "issue_not_found", "Issue not found");
        }
        return c.json({ subscription }, 201);
      })
      .delete("/:issueId/subscription", validateIssueSheetIssueParams, async (c) => {
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        const removed = await service.unwatchIssue({
          organizationId: c.var.auth.organization.localOrganizationId,
          projectId: project.id,
          issueId: params.issueId,
          actorUserId: c.var.auth.user.localUserId,
        });
        if (!removed) {
          return notFoundResponse(c, "issue_not_found", "Issue not found");
        }
        return c.body(null, 204);
      })
      .post("/", validateIssueSheetParams, validateCreateIssueBody, async (c) => {
        if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
          return projectForbiddenResponse(c);
        }
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        try {
          const issue = await service.createIssue({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            actorUserId: c.var.auth.user.localUserId,
            body: c.req.valid("json"),
          });
          return c.json({ issue }, 201);
        } catch (error) {
          if (error instanceof Error && error.message === "assignee_not_assignable") {
            return badRequestResponse(
              c,
              "assignee_not_assignable",
              "Assignee must be an active workspace member with project access",
            );
          }
          if (error instanceof Error && error.message === "translation_key_not_found") {
            return badRequestResponse(
              c,
              "translation_key_not_found",
              "Translation key not found in this project",
            );
          }
          if (error instanceof Error && error.message === "invalid_issue_sheet_select_value") {
            return badRequestResponse(
              c,
              "invalid_issue_sheet_select_value",
              "Invalid select value",
            );
          }
          if (error instanceof Error && error.message === "issue_sheet_column_not_found") {
            return badRequestResponse(c, "issue_sheet_column_not_found", "Column not found");
          }
          if (error instanceof Error && error.message.includes("duplicate")) {
            return conflictResponse(c, "issue_sheet_issue_exists", "Issue already exists");
          }
          throw error;
        }
      })
      .patch("/:issueId", validateIssueSheetIssueParams, validateUpdateIssueBody, async (c) => {
        if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
          return projectForbiddenResponse(c);
        }
        const projectParams = c.req.valid("param");
        const project = await requireProject(c, projectParams.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        try {
          const issue = await service.updateIssue({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            issueId: projectParams.issueId,
            actorUserId: c.var.auth.user.localUserId,
            body: c.req.valid("json"),
          });
          if (!issue) {
            return badRequestResponse(c, "issue_sheet_issue_not_found", "Issue not found");
          }
          return c.json({ issue }, 200);
        } catch (error) {
          if (error instanceof Error && error.message === "assignee_not_assignable") {
            return badRequestResponse(
              c,
              "assignee_not_assignable",
              "Assignee must be an active workspace member with project access",
            );
          }
          if (error instanceof Error && error.message === "translation_key_not_found") {
            return badRequestResponse(
              c,
              "translation_key_not_found",
              "Translation key not found in this project",
            );
          }
          throw error;
        }
      })
      .patch("/:issueId/values", validateIssueSheetIssueParams, validateSetValueBody, async (c) => {
        if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
          return projectForbiddenResponse(c);
        }
        const projectParams = c.req.valid("param");
        const project = await requireProject(c, projectParams.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        try {
          const value = await service.setValue({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            issueId: projectParams.issueId,
            body: c.req.valid("json"),
          });
          if (!value) {
            return badRequestResponse(c, "issue_sheet_column_not_found", "Column not found");
          }
          return c.json({ value }, 200);
        } catch (error) {
          if (error instanceof Error && error.message === "issue_sheet_issue_not_found") {
            return badRequestResponse(c, "issue_sheet_issue_not_found", "Issue not found");
          }
          if (error instanceof Error && error.message === "invalid_issue_sheet_select_value") {
            return badRequestResponse(
              c,
              "invalid_issue_sheet_select_value",
              "Invalid select value",
            );
          }
          throw error;
        }
      })
      .delete("/columns/:columnId", validateIssueSheetColumnParams, async (c) => {
        if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
          return projectForbiddenResponse(c);
        }
        const params = c.req.valid("param");
        const project = await requireProject(c, params.projectId);
        if (!project) {
          return projectNotFoundResponse(c);
        }

        try {
          const result = await service.deleteColumn({
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
            columnId: params.columnId,
          });
          if (!result) {
            return notFoundResponse(c, "issue_sheet_column_not_found");
          }
          return c.body(null, 204);
        } catch (error) {
          if (error instanceof Error && error.message === "issue_sheet_column_not_deletable") {
            return badRequestResponse(
              c,
              "issue_sheet_column_not_deletable",
              "Built-in columns cannot be deleted",
            );
          }
          throw error;
        }
      })
      .patch(
        "/columns/:columnId",
        validateIssueSheetColumnParams,
        validateUpdateColumnBody,
        async (c) => {
          if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
            return projectForbiddenResponse(c);
          }
          const params = c.req.valid("param");
          const project = await requireProject(c, params.projectId);
          if (!project) {
            return projectNotFoundResponse(c);
          }

          try {
            const column = await service.updateColumn({
              organizationId: c.var.auth.organization.localOrganizationId,
              projectId: project.id,
              columnId: params.columnId,
              body: c.req.valid("json"),
            });
            if (!column) {
              return notFoundResponse(c, "issue_sheet_column_not_found");
            }
            return c.json({ column }, 200);
          } catch (error) {
            if (
              error instanceof Error &&
              error.message === "issue_sheet_column_config_not_editable"
            ) {
              return badRequestResponse(
                c,
                "issue_sheet_column_config_not_editable",
                "This column's options cannot be edited",
              );
            }
            if (
              error instanceof Error &&
              error.message === "issue_sheet_column_icon_not_editable"
            ) {
              return badRequestResponse(
                c,
                "issue_sheet_column_icon_not_editable",
                "Built-in columns cannot change icon",
              );
            }
            throw error;
          }
        },
      )
  );
}
