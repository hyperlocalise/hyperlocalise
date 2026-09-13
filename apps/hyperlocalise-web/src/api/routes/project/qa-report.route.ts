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

import { isJobCreateAllowed, isProjectWriteAllowed } from "@/api/auth/capability-guards";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { validationErrorResponse } from "@/api/errors";
import { badRequestResponse, conflictResponse } from "@/api/response.schema";
import {
  getOwnedProjectRecord,
  projectForbiddenResponse,
  projectNotFoundResponse,
} from "@/api/routes/project/project.shared";
import { buildTranslationQaFindingHref } from "@/lib/qa/finding-href";
import {
  getTranslationQaRun,
  listLatestSucceededQaFindingsForCat,
  listTranslationQaFindings,
  listTranslationQaRuns,
  updateProjectQaScanCadence,
} from "@/lib/qa/qa-report-store";
import { startTranslationQaScan } from "@/lib/qa/run-project-qa-scan";
import type { TranslationQaScanCadence } from "@/lib/qa/types";
import type { TranslationQaScanQueue } from "@/lib/workflow/types";
import { createTranslationQaScanQueue } from "@/workflows/adapters";

import {
  qaReportFindingsQuerySchema,
  qaReportLatestFindingsQuerySchema,
  qaReportProjectParamsSchema,
  qaReportRunParamsSchema,
  qaReportSettingsBodySchema,
} from "./qa-report.schema";

const validateProjectParams = validator("param", (value, c) => {
  const parsed = qaReportProjectParamsSchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_project_params",
      "Invalid project",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateRunParams = validator("param", (value, c) => {
  const parsed = qaReportRunParamsSchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_qa_report_params",
      "Invalid QA report",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateLatestFindingsQuery = validator("query", (value, c) => {
  const parsed = qaReportLatestFindingsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_qa_report_query",
      "Invalid QA report query",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateFindingsQuery = validator("query", (value, c) => {
  const parsed = qaReportFindingsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_qa_report_query",
      "Invalid QA report query",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateSettingsBody = validator("json", (value, c) => {
  const parsed = qaReportSettingsBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_qa_report_settings",
      "Invalid QA report settings",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

function serializeRun(run: {
  id: string;
  projectId: string;
  trigger: string;
  status: string;
  segmentCount: number;
  findingCount: number;
  errorCount: number;
  warningCount: number;
  summary: {
    byCheckType: Record<string, number>;
    bySeverity: Record<string, number>;
    byLocale: Record<string, number>;
  };
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: run.id,
    projectId: run.projectId,
    trigger: run.trigger,
    status: run.status,
    segmentCount: run.segmentCount,
    findingCount: run.findingCount,
    errorCount: run.errorCount,
    warningCount: run.warningCount,
    summary: run.summary,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}

async function requireNativeProject(auth: AuthVariables["auth"], projectId: string) {
  const project = await getOwnedProjectRecord(auth, projectId);
  if (!project) {
    return { kind: "missing" as const };
  }
  if (project.source !== "native") {
    return { kind: "unsupported" as const };
  }
  return { kind: "ok" as const, project };
}

export function createProjectQaReportRoutes(
  options: {
    translationQaScanQueue?: TranslationQaScanQueue;
  } = {},
) {
  const translationQaScanQueue = options.translationQaScanQueue ?? createTranslationQaScanQueue();

  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validateProjectParams, async (c) => {
      const { projectId } = c.req.valid("param");
      const resolved = await requireNativeProject(c.var.auth, projectId);
      if (resolved.kind === "missing") {
        return projectNotFoundResponse(c);
      }
      if (resolved.kind === "unsupported") {
        return badRequestResponse(
          c,
          "qa_scan_not_supported",
          "QA reports are available for native projects",
        );
      }

      const reports = await listTranslationQaRuns({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
      });

      return c.json(
        {
          reports: reports.map(serializeRun),
          settings: {
            cadence: resolved.project.qaScanCadence,
            lastRunAt: resolved.project.qaScanLastRunAt?.toISOString() ?? null,
            canRun: isJobCreateAllowed(c.var.auth.membership.role),
            canManageSchedule: isProjectWriteAllowed(c.var.auth.membership.role),
          },
        },
        200,
      );
    })
    .post("/", validateProjectParams, async (c) => {
      if (!isJobCreateAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }

      const { projectId } = c.req.valid("param");
      const resolved = await requireNativeProject(c.var.auth, projectId);
      if (resolved.kind === "missing") {
        return projectNotFoundResponse(c);
      }
      if (resolved.kind === "unsupported") {
        return badRequestResponse(
          c,
          "qa_scan_not_supported",
          "QA reports are available for native projects",
        );
      }

      const result = await startTranslationQaScan({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
        trigger: "manual",
        createdByUserId: c.var.auth.user.localUserId,
        queue: translationQaScanQueue,
      });
      if (!result.ok) {
        if (result.code === "scan_in_progress") {
          return conflictResponse(c, "qa_scan_in_progress", "A QA scan is already running");
        }
        return badRequestResponse(
          c,
          "qa_scan_not_supported",
          "QA reports are available for native projects",
        );
      }

      const report = await getTranslationQaRun({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
        runId: result.runId,
      });
      if (!report) {
        return projectNotFoundResponse(c);
      }

      return c.json({ report: serializeRun(report) }, 201);
    })
    .patch("/settings", validateProjectParams, validateSettingsBody, async (c) => {
      if (!isProjectWriteAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }

      const { projectId } = c.req.valid("param");
      const { cadence } = c.req.valid("json");
      const resolved = await requireNativeProject(c.var.auth, projectId);
      if (resolved.kind === "missing") {
        return projectNotFoundResponse(c);
      }
      if (resolved.kind === "unsupported") {
        return badRequestResponse(
          c,
          "qa_scan_not_supported",
          "QA reports are available for native projects",
        );
      }

      const settings = await updateProjectQaScanCadence({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
        cadence: cadence as TranslationQaScanCadence,
      });

      return c.json(
        {
          settings: {
            cadence: settings?.qaScanCadence ?? cadence,
            lastRunAt: settings?.qaScanLastRunAt?.toISOString() ?? null,
            canRun: isJobCreateAllowed(c.var.auth.membership.role),
            canManageSchedule: true,
          },
        },
        200,
      );
    })
    .get("/latest-findings", validateProjectParams, validateLatestFindingsQuery, async (c) => {
      const { projectId } = c.req.valid("param");
      const query = c.req.valid("query");
      const resolved = await requireNativeProject(c.var.auth, projectId);
      if (resolved.kind === "missing") {
        return projectNotFoundResponse(c);
      }
      if (resolved.kind === "unsupported") {
        return badRequestResponse(
          c,
          "qa_scan_not_supported",
          "QA reports are available for native projects",
        );
      }

      const { runId, findings } = await listLatestSucceededQaFindingsForCat({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
        locale: query.locale,
        sourcePath: query.sourcePath,
        limit: query.limit,
        offset: query.offset,
      });

      return c.json(
        {
          runId,
          findings: findings.map((finding) => ({
            translationKeyId: finding.translationKeyId,
            key: finding.key,
            sourcePath: finding.sourcePath,
            targetLocale: finding.targetLocale,
            checkType: finding.checkType,
            severity: finding.severity,
            category: finding.category,
            message: finding.message,
            relatedTokens: finding.relatedTokens,
            sourceText: finding.sourceText,
            targetText: finding.targetText,
          })),
        },
        200,
      );
    })
    .get("/:runId", validateRunParams, validateFindingsQuery, async (c) => {
      const { projectId, runId } = c.req.valid("param");
      const query = c.req.valid("query");
      const resolved = await requireNativeProject(c.var.auth, projectId);
      if (resolved.kind === "missing") {
        return projectNotFoundResponse(c);
      }
      if (resolved.kind === "unsupported") {
        return badRequestResponse(
          c,
          "qa_scan_not_supported",
          "QA reports are available for native projects",
        );
      }

      const report = await getTranslationQaRun({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
        runId,
      });
      if (!report) {
        return projectNotFoundResponse(c);
      }

      const { findings, total, limit, offset } = await listTranslationQaFindings({
        organizationId: resolved.project.organizationId,
        projectId: resolved.project.id,
        runId,
        locale: query.locale,
        checkType: query.checkType,
        severity: query.severity,
        limit: query.limit,
        offset: query.offset,
      });

      return c.json(
        {
          report: serializeRun(report),
          findings: findings.map((finding) => ({
            id: finding.id,
            runId: finding.runId,
            key: finding.key,
            sourcePath: finding.sourcePath,
            targetLocale: finding.targetLocale,
            checkType: finding.checkType,
            severity: finding.severity,
            category: finding.category,
            message: finding.message,
            relatedTokens: finding.relatedTokens,
            sourceText: finding.sourceText,
            targetText: finding.targetText,
            editorHref: buildTranslationQaFindingHref({
              organizationSlug:
                c.req.param("organizationSlug") ?? c.var.auth.organization.slug ?? "",
              projectId: resolved.project.id,
              sourcePath: finding.sourcePath,
              targetLocale: finding.targetLocale,
              key: finding.key,
            }),
          })),
          total,
          limit,
          offset,
        },
        200,
      );
    });
}
