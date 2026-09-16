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
import { validator } from "hono/validator";

import { isWriteBackTranslationAllowed } from "@/api/auth/capability-guards";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { validationErrorResponse } from "@/api/errors";
import { badRequestResponse, forbiddenResponse } from "@/api/response.schema";
import {
  promoteQaFindingsBodySchema,
  workspaceQaFindingsQuerySchema,
} from "@/api/routes/project/qa-report.schema";
import { promoteQaFindingsToIssues } from "@/lib/qa/promote-qa-findings-to-issues";
import {
  listLatestTranslationQaRunsForOrganization,
  listOrganizationLatestSucceededFindings,
} from "@/lib/qa/qa-report-store";
import { serializeTranslationQaFinding } from "@/lib/qa/serialize-qa-finding";

const validateWorkspaceFindingsQuery = validator("query", (value, c) => {
  const parsed = workspaceQaFindingsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_qa_report_query",
      "Invalid QA findings query",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validatePromoteFindingsBody = validator("json", (value, c) => {
  const parsed = promoteQaFindingsBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_qa_findings_promote",
      "Invalid QA findings promote payload",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

function createWorkspaceQaFindingsRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .get("/", validateWorkspaceFindingsQuery, async (c) => {
      const query = c.req.valid("query");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const organizationSlug = c.var.auth.organization.slug ?? "";

      const { findings, total, limit, offset } = await listOrganizationLatestSucceededFindings({
        organizationId,
        projectId: query.projectId,
        locale: query.locale,
        checkType: query.checkType,
        severity: query.severity,
        limit: query.limit,
        offset: query.offset,
      });

      return c.json(
        {
          findings: findings.map((finding) => ({
            ...serializeTranslationQaFinding({
              organizationSlug,
              projectId: finding.projectId,
              finding,
            }),
            projectName: finding.projectName,
          })),
          total,
          limit,
          offset,
        },
        200,
      );
    })
    .post("/promote", validatePromoteFindingsBody, async (c) => {
      if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "You do not have permission to create issues");
      }

      const body = c.req.valid("json");
      const auth = c.var.auth;

      try {
        const promoted = await promoteQaFindingsToIssues({
          organizationId: auth.organization.localOrganizationId,
          organizationSlug: auth.organization.slug ?? "",
          actorUserId: auth.user.localUserId,
          findingIds: body.findingIds,
        });
        return c.json(promoted, 200);
      } catch (error) {
        if (error instanceof Error && error.message === "qa_finding_not_found") {
          return badRequestResponse(
            c,
            "qa_finding_not_found",
            "One or more findings were not found",
          );
        }
        if (error instanceof Error && error.message === "qa_finding_stale") {
          return badRequestResponse(
            c,
            "qa_finding_stale",
            "Findings must be from each project's latest successful scan",
          );
        }
        throw error;
      }
    });
}

export function createWorkspaceQaReportRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", async (c) => {
      const rows = await listLatestTranslationQaRunsForOrganization(
        c.var.auth.organization.localOrganizationId,
      );

      return c.json(
        {
          reports: rows.map((row) => ({
            projectId: row.projectId,
            projectName: row.projectName,
            cadence: row.qaScanCadence,
            lastRunAt: row.qaScanLastRunAt?.toISOString() ?? row.createdAt?.toISOString() ?? null,
            report: row.runId
              ? {
                  id: row.runId,
                  projectId: row.projectId,
                  trigger: row.trigger ?? "manual",
                  status: row.status ?? "succeeded",
                  segmentCount: row.segmentCount ?? 0,
                  findingCount: row.findingCount ?? 0,
                  errorCount: row.errorCount ?? 0,
                  warningCount: row.warningCount ?? 0,
                  summary: row.summary ?? { byCheckType: {}, bySeverity: {}, byLocale: {} },
                  errorCode: null,
                  errorMessage: null,
                  startedAt: row.startedAt?.toISOString() ?? null,
                  completedAt: row.completedAt?.toISOString() ?? null,
                  createdAt: row.createdAt?.toISOString() ?? new Date(0).toISOString(),
                }
              : null,
          })),
        },
        200,
      );
    })
    .route("/findings", createWorkspaceQaFindingsRoutes());
}
