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

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { listLatestTranslationQaRunsForOrganization } from "@/lib/qa/qa-report-store";

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
    });
}
