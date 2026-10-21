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
import { and, count, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { getRepositorySourceFileVersionForStoredFile } from "@/lib/file-storage/records";
import { isErr } from "@/lib/primitives/result/results";
import type { VisualTaskStep } from "../schema/types";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

const LIST_SEPARATOR = /[\s,;]+/;
const FINISHED_JOB_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

type ActionInput = {
  organizationId: string;
  /** Stamped on the jobs a step creates, so a resumed step finds its job instead of making another. */
  idempotencyKey?: string;
};

type ProjectScope = { sourceLocale: string; targetLocales: string[] };

function failure(code: string, message: string): VisualWorkflowNodeExecutionResult {
  return { ok: false, error: { code, message } };
}

/**
 * Reads a list setting typed as "fr-FR, de-DE", or wired from an earlier step's array, which a
 * template renders as JSON.
 */
export function parseWorkflowList(value: unknown): string[] {
  let entries: unknown[];
  if (Array.isArray(value)) {
    entries = value;
  } else if (typeof value === "number") {
    entries = [value];
  } else if (typeof value !== "string") {
    entries = [];
  } else if (value.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      entries = Array.isArray(parsed) ? parsed : [];
    } catch {
      entries = value.replace(/[[\]"]/g, " ").split(LIST_SEPARATOR);
    }
  } else {
    entries = value.split(LIST_SEPARATOR);
  }
  return [
    ...new Set(
      entries.flatMap((entry) =>
        typeof entry === "string" || typeof entry === "number" ? [String(entry).trim()] : [],
      ),
    ),
  ].filter(Boolean);
}

async function loadProjectScope(
  organizationId: string,
  projectId: string,
): Promise<ProjectScope | null> {
  const [project] = await db
    .select({
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.organizationId, organizationId), eq(schema.projects.id, projectId)),
    )
    .limit(1);
  return project
    ? { sourceLocale: project.sourceLocale ?? "", targetLocales: project.targetLocales }
    : null;
}

function resolveLocales(configured: unknown, project: ProjectScope): string[] {
  const locales = parseWorkflowList(configured);
  return locales.length > 0 ? locales : project.targetLocales;
}

async function findJobForStep(input: {
  organizationId: string;
  projectId: string;
  idempotencyKey?: string;
}) {
  if (!input.idempotencyKey) return null;
  const [job] = await db
    .select({ id: schema.jobs.id, status: schema.jobs.status })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.organizationId, input.organizationId),
        eq(schema.jobs.projectId, input.projectId),
        sql`${schema.jobs.inputPayload} -> 'metadata' ->> 'workflowStepKey' = ${input.idempotencyKey}`,
      ),
    )
    .limit(1);
  return job ?? null;
}

export async function runMachineTranslateAction(
  input: ActionInput & {
    projectId: string;
    sourceFileId: string;
    targetLocales: unknown;
    useTranslationMemory: boolean;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.projectId || !input.sourceFileId) {
    return failure(
      "missing_translate_config",
      "Choose a project and a source file before translating.",
    );
  }
  const project = await loadProjectScope(input.organizationId, input.projectId);
  if (!project) return failure("project_not_found", "Choose a project in this organization.");
  const targetLocales = resolveLocales(input.targetLocales, project);
  if (!project.sourceLocale || targetLocales.length === 0) {
    return failure(
      "missing_project_locales",
      "Set the project's source and target locales before translating.",
    );
  }

  const existing = await findJobForStep({ ...input, projectId: input.projectId });
  if (existing) {
    if (existing.status === "failed") {
      return failure(
        "translation_job_failed",
        "The previous translation job for this step failed. No translation was queued.",
      );
    }
    if (existing.status === "cancelled") {
      return failure(
        "translation_job_cancelled",
        "The previous translation job for this step was cancelled.",
      );
    }
    return { ok: true, output: { jobId: existing.id, status: existing.status, targetLocales } };
  }

  const [{ enqueueFileTranslationJob }, { createTranslationJobEventQueue }] = await Promise.all([
    import("@/lib/projects/jobs/enqueue-file-translation-job"),
    import("@/lib/workflow/queues"),
  ]);
  const result = await enqueueFileTranslationJob({
    organizationId: input.organizationId,
    projectId: input.projectId,
    assigneeType: "agent",
    sourceFileId: input.sourceFileId,
    sourceLocale: project.sourceLocale,
    targetLocales,
    ignoreTranslationMemory: !input.useTranslationMemory,
    metadata: input.idempotencyKey ? { workflowStepKey: input.idempotencyKey } : undefined,
    jobQueue: createTranslationJobEventQueue(),
  });
  if (!result.ok) return failure(result.code, result.message);

  return { ok: true, output: { jobId: result.jobId, status: "queued", targetLocales } };
}

export async function runCreateTaskAction(
  input: ActionInput & {
    projectId: string;
    sourceFileId: string;
    targetLocales: unknown;
    step: VisualTaskStep;
    assigneeWorkosUserId: string;
    title: string;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.projectId || !input.sourceFileId) {
    return failure(
      "missing_task_config",
      "Choose a project and a source file before assigning a task.",
    );
  }
  const project = await loadProjectScope(input.organizationId, input.projectId);
  if (!project) return failure("project_not_found", "Choose a project in this organization.");
  const targetLocales = resolveLocales(input.targetLocales, project);
  if (!project.sourceLocale || targetLocales.length === 0) {
    return failure(
      "missing_project_locales",
      "Set the project's source and target locales before assigning a task.",
    );
  }

  const existing = await findJobForStep({ ...input, projectId: input.projectId });
  if (existing) {
    if (existing.status === "failed") {
      return failure("task_job_failed", "The previous task for this step failed.");
    }
    if (existing.status === "cancelled") {
      return failure("task_job_cancelled", "The previous task for this step was cancelled.");
    }
    return {
      ok: true,
      output: {
        jobId: existing.id,
        step: input.step,
        assigned: Boolean(input.assigneeWorkosUserId),
        targetLocales,
      },
    };
  }

  const { createWorkflowTaskJob } = await import("@/lib/projects/jobs/create-workflow-task-job");
  const result = await createWorkflowTaskJob({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceFileId: input.sourceFileId,
    sourceLocale: project.sourceLocale,
    targetLocales,
    step: input.step,
    assigneeWorkosUserId: input.assigneeWorkosUserId || undefined,
    title: input.title,
    metadata: input.idempotencyKey ? { workflowStepKey: input.idempotencyKey } : undefined,
  });
  if (isErr(result)) return failure(result.error.code, result.error.message);

  return {
    ok: true,
    output: {
      jobId: result.value.jobId,
      step: input.step,
      assigned: result.value.ownerUserId !== null,
      targetLocales,
    },
  };
}

export async function runCheckProgressAction(
  input: ActionInput & {
    projectId: string;
    sourceFileId: string;
    targetLocales: unknown;
    jobId: string;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.projectId) {
    return failure("missing_progress_config", "Choose a project to check.");
  }
  const project = await loadProjectScope(input.organizationId, input.projectId);
  if (!project) return failure("project_not_found", "Choose a project in this organization.");
  const locales = resolveLocales(input.targetLocales, project);

  let repositorySourceFileId: string | null = null;
  if (input.sourceFileId) {
    const version = await getRepositorySourceFileVersionForStoredFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      fileId: input.sourceFileId,
    });
    if (!version) {
      return failure(
        "source_file_not_ingested",
        "The source file has no strings in this project yet.",
      );
    }
    repositorySourceFileId = version.repositorySourceFileId;
  }

  const keyScope = and(
    eq(schema.projectTranslationKeys.organizationId, input.organizationId),
    eq(schema.projectTranslationKeys.projectId, input.projectId),
    eq(schema.projectTranslationKeys.isHidden, false),
    repositorySourceFileId
      ? eq(schema.projectTranslationKeys.repositorySourceFileId, repositorySourceFileId)
      : undefined,
  );
  const [keyCount] = await db
    .select({ value: count() })
    .from(schema.projectTranslationKeys)
    .where(keyScope);
  const statusRows =
    locales.length === 0
      ? []
      : await db
          .select({ status: schema.projectTranslations.status, value: count() })
          .from(schema.projectTranslations)
          .innerJoin(
            schema.projectTranslationKeys,
            eq(schema.projectTranslations.translationKeyId, schema.projectTranslationKeys.id),
          )
          .where(
            and(
              keyScope,
              eq(schema.projectTranslations.organizationId, input.organizationId),
              eq(schema.projectTranslations.projectId, input.projectId),
              inArray(schema.projectTranslations.targetLocale, locales),
              sql`btrim(${schema.projectTranslations.text}) <> ''`,
            ),
          )
          .groupBy(schema.projectTranslations.status);

  const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, row.value]));
  const total = (keyCount?.value ?? 0) * locales.length;
  const approved = byStatus.approved ?? 0;
  const rejected = byStatus.rejected ?? 0;
  const needsReview = (byStatus.needs_review ?? 0) + (byStatus.draft ?? 0);
  const translated = approved + rejected + needsReview;
  const untranslated = Math.max(total - translated, 0);
  const percent = (value: number) => (total === 0 ? 0 : Math.floor((value / total) * 100));

  let job: { status: string } | undefined;
  if (input.jobId) {
    [job] = await db
      .select({ status: schema.jobs.status })
      .from(schema.jobs)
      .where(
        and(eq(schema.jobs.organizationId, input.organizationId), eq(schema.jobs.id, input.jobId)),
      )
      .limit(1);
    if (!job) return failure("job_not_found", "The job to check was not found.");
  }

  return {
    ok: true,
    output: {
      total,
      untranslated,
      needsReview,
      approved,
      rejected,
      translatedPercent: percent(translated),
      approvedPercent: percent(approved),
      isTranslated: total > 0 && untranslated === 0,
      isApproved: total > 0 && approved === total,
      ...(job ? { jobStatus: job.status, jobFinished: FINISHED_JOB_STATUSES.has(job.status) } : {}),
    },
  };
}

export async function runQaChecksAction(
  input: ActionInput & { projectId: string },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.projectId) {
    return failure("missing_qa_config", "Choose a project to check.");
  }
  const { runProjectTranslationQaScan } = await import("@/lib/qa/run-project-qa-scan");
  let scan: Awaited<ReturnType<typeof runProjectTranslationQaScan>>;
  try {
    scan = await runProjectTranslationQaScan({
      organizationId: input.organizationId,
      projectId: input.projectId,
      trigger: "manual",
    });
  } catch {
    return failure("qa_scan_failed", "The QA checks did not finish.");
  }
  if (!scan.ok) {
    return failure(
      scan.code,
      scan.code === "scan_in_progress"
        ? "QA checks are already running for this project."
        : scan.code === "project_not_native"
          ? "QA checks run on Hyperlocalise projects, not projects synced from another TMS."
          : "Choose a project in this organization.",
    );
  }

  const [run] = await db
    .select({
      errorCount: schema.translationQaRuns.errorCount,
      warningCount: schema.translationQaRuns.warningCount,
      findingCount: schema.translationQaRuns.findingCount,
    })
    .from(schema.translationQaRuns)
    .where(eq(schema.translationQaRuns.id, scan.runId))
    .limit(1);
  const errorCount = run?.errorCount ?? 0;

  return {
    ok: true,
    output: {
      runId: scan.runId,
      passed: errorCount === 0,
      errorCount,
      warningCount: run?.warningCount ?? 0,
      findingCount: run?.findingCount ?? 0,
    },
  };
}
