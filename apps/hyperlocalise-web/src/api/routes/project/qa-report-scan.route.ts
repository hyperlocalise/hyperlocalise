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
import { z } from "zod";

import { isJobCreateAllowed } from "@/api/auth/capability-guards";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { validationErrorResponse } from "@/api/errors";
import { badRequestResponse, conflictResponse } from "@/api/response.schema";
import {
  getOwnedProjectRecord,
  projectForbiddenResponse,
  projectNotFoundResponse,
} from "@/api/routes/project/project.shared";
import { projectIdSchema } from "@/lib/projects/identity/project-id";
import { getTranslationQaRun } from "@/lib/qa/qa-report-store";
import { startTranslationQaScan } from "@/lib/qa/run-project-qa-scan";
import type { TranslationQaScanQueue } from "@/lib/workflow/types";
import { createTranslationQaScanQueue } from "@/workflows/adapters";

const qaReportProjectParamsSchema = z.object({
  projectId: projectIdSchema,
});

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

/** Starts a project QA scan and enqueues the workflow (read/promote routes live in go-svc). */
export function createProjectQaReportScanRoutes(
  options: {
    translationQaScanQueue?: TranslationQaScanQueue;
  } = {},
) {
  const translationQaScanQueue = options.translationQaScanQueue ?? createTranslationQaScanQueue();

  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
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
    });
}
