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

import { createAutumnBooleanFeatureMiddleware } from "@/api/middleware/autumn-boolean-feature";
import { createZodValidator } from "@/api/errors";
import type { AuthVariables } from "@/api/auth/workos";
import { isWriteBackTranslationAllowed } from "@/api/auth/capability-guards";
import { badRequestResponse } from "@/api/response.schema";
import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { sessionActivityActor } from "@/lib/activity-log/file-segment-events";
import { enqueueQueryImportedActivity } from "@/lib/activity-log/query-events";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";

import { issueSheetImportBodySchema, issueSheetParamsSchema } from "./issue-sheet.schema";
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
const validateImportBody = createZodValidator(
  "json",
  issueSheetImportBodySchema,
  "invalid_issue_sheet_import_payload",
);

const requireQueriesBoard = createAutumnBooleanFeatureMiddleware(
  autumnFeatureIds.queriesBoard,
  "Queries is not included in your current plan.",
);

export function createIssueSheetRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", requireQueriesBoard)
    .post("/import", validateIssueSheetParams, validateImportBody, async (c) => {
      if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);
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
        if (!result.dryRun && result.created > 0) {
          await enqueueQueryImportedActivity({
            ...sessionActivityActor(c.var.auth.user.localUserId),
            itemCount: result.created,
            organizationId: c.var.auth.organization.localOrganizationId,
            projectId: project.id,
          });
        }
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
    });
}
