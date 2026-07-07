import { Hono } from "hono";

import { createZodValidator } from "@/api/errors";
import type { AuthVariables } from "@/api/auth/workos";
import {
  isProjectMutationAllowed,
  isWriteBackTranslationAllowed,
} from "@/api/auth/capability-guards";
import { badRequestResponse, conflictResponse } from "@/api/response.schema";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";

import {
  issueSheetColumnParamsSchema,
  issueSheetCreateColumnBodySchema,
  issueSheetCreateIssueBodySchema,
  issueSheetImportBodySchema,
  issueSheetIssueParamsSchema,
  issueSheetParamsSchema,
  issueSheetQuerySchema,
  issueSheetSetValueBodySchema,
  issueSheetUpdateIssueBodySchema,
} from "./issue-sheet.schema";
import { forbiddenResponse, getOwnedProject, projectNotFoundResponse } from "./project.shared";

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

async function requireProject(c: { var: { auth: AuthVariables["auth"] } }, projectId: string) {
  const project = await getOwnedProject(c.var.auth, projectId);
  if (!project) {
    return null;
  }
  return project;
}

export function createIssueSheetRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
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
    .post("/", validateIssueSheetParams, validateCreateIssueBody, async (c) => {
      if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
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
        if (error instanceof Error && error.message === "invalid_issue_sheet_select_value") {
          return badRequestResponse(c, "invalid_issue_sheet_select_value", "Invalid select value");
        }
        if (error instanceof Error && error.message.includes("duplicate")) {
          return conflictResponse(c, "issue_sheet_issue_exists", "Issue already exists");
        }
        throw error;
      }
    })
    .post("/import", validateIssueSheetParams, validateImportBody, async (c) => {
      if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
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
    .patch("/:issueId", validateIssueSheetIssueParams, validateUpdateIssueBody, async (c) => {
      if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }
      const projectParams = c.req.valid("param");
      const project = await requireProject(c, projectParams.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

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
    .post("/columns", validateIssueSheetParams, validateCreateColumnBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
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
    .patch("/:issueId/values", validateIssueSheetIssueParams, validateSetValueBody, async (c) => {
      if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
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
          return badRequestResponse(c, "invalid_issue_sheet_select_value", "Invalid select value");
        }
        throw error;
      }
    })
    .delete("/columns/:columnId", validateIssueSheetColumnParams, async (c) => {
      return badRequestResponse(
        c,
        "issue_sheet_column_delete_not_supported",
        "Deleting columns is not supported yet",
      );
    });
}
