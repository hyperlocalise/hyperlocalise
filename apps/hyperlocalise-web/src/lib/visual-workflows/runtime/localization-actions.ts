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
import { createHash } from "node:crypto";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { getRepositorySourceFileVersionForStoredFile } from "@/lib/file-storage/records";
import { isErr } from "@/lib/primitives/result/results";
import type { TranslationQaQuality } from "@/lib/qa/qa-scoring";
import { QA_DOMAIN_PROFILES, type QaDomain } from "@/lib/qa/quality-domains";
import type {
  TranslationQaCheck,
  TranslationQaCheckType,
  TranslationQaEstimationSummary,
  TranslationQaGlossaryTerm,
  TranslationQaScanScope,
} from "@/lib/qa/types";
import { validateTranslationSegment } from "@/lib/qa/validate-segment";
import type { VisualTaskStep } from "../schema/types";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";
import { parseWorkflowList } from "./parse-workflow-list";

export { parseWorkflowList };

const FINISHED_JOB_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

type ActionInput = {
  organizationId: string;
  /** Stamped on the jobs a step creates, so a resumed step finds its job instead of making another. */
  idempotencyKey?: string;
};

type ProjectScope = { sourceLocale: string; targetLocales: string[] };

const MAX_TRANSLATION_JOB_CONTEXT_CHARS = 20_000;
const MAX_INLINE_QA_FINDINGS = 100;
const MODEL_ASSISTED_QA_CHECKS = new Set<TranslationQaCheckType>(["guideline", "quality_estimate"]);

function redactedQaMessage(checkType: TranslationQaCheckType): string {
  return `The ${checkType.replaceAll("_", " ")} check found an issue.`;
}

function failure(code: string, message: string): VisualWorkflowNodeExecutionResult {
  return { ok: false, error: { code, message } };
}

function invalidDueDate(): VisualWorkflowNodeExecutionResult {
  return failure(
    "invalid_due_date",
    "The due date is not a date, such as 2026-05-01T17:00Z, or a period, such as +3d.",
  );
}

/** A period counted from now: `+3d` or `+12h`. A recurring workflow has no fixed date to give. */
const DUE_IN_PERIOD = /^\+\s*(\d{1,4})\s*([dh])$/i;
const HOUR_MS = 60 * 60 * 1000;

/**
 * A due date setting: null when it is empty, undefined when it is neither a date nor a period.
 * A period is counted from `now`, the moment the step runs.
 */
export function parseWorkflowDueAt(
  value: string | undefined,
  now: Date = new Date(),
): Date | null | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const period = DUE_IN_PERIOD.exec(trimmed);
  if (period) {
    const amount = Number(period[1]);
    if (amount === 0) return undefined;
    const hours = period[2]!.toLowerCase() === "d" ? amount * 24 : amount;
    return new Date(now.getTime() + hours * HOUR_MS);
  }
  // A value that starts like a period is only ever a period: left to Date, "+3" is the year 2001.
  if (trimmed.startsWith("+")) return undefined;
  const dueAt = new Date(trimmed);
  return Number.isNaN(dueAt.getTime()) ? undefined : dueAt;
}

/**
 * A step's due date: the date it was given, or else this many hours after the step runs. Null when
 * it has neither, undefined when the date is not a date.
 */
export function resolveWorkflowDueAt(input: {
  dueAt?: string;
  dueInHours?: number;
  now?: Date;
}): Date | null | undefined {
  const dueAt = parseWorkflowDueAt(input.dueAt, input.now);
  if (dueAt !== null) return dueAt;
  if (!input.dueInHours || input.dueInHours <= 0) return null;
  return new Date((input.now ?? new Date()).getTime() + input.dueInHours * HOUR_MS);
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

function translationJobContext(input: {
  instructions: string;
  contextOverrides: unknown;
}): string | undefined {
  const instructions = input.instructions.trim();
  const overrides =
    input.contextOverrides &&
    typeof input.contextOverrides === "object" &&
    !Array.isArray(input.contextOverrides)
      ? JSON.stringify(input.contextOverrides)
      : "";
  const context = [instructions, overrides].filter(Boolean).join("\n\n");
  return context || undefined;
}

async function jobMetadata(organizationId: string, jobId: string) {
  const [job] = await db
    .select({ createdAt: schema.jobs.createdAt, status: schema.jobs.status })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.organizationId, organizationId), eq(schema.jobs.id, jobId)))
    .limit(1);
  return job ? { createdAt: job.createdAt.toISOString(), status: job.status } : null;
}

export async function runCreateTranslationJobAction(
  input: ActionInput & {
    sourceKind: "string" | "file";
    projectId: string;
    sourceText: string;
    sourceFileId: string;
    sourceLocale: string;
    targetLocales: unknown;
    instructions: string;
    contextOverrides: unknown;
    signal?: AbortSignal;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (input.signal?.aborted) return failure("execution_cancelled", "The workflow was cancelled.");
  if (!input.projectId || !input.sourceLocale) {
    return failure("missing_translation_job_config", "Choose a project and source locale.");
  }
  if (input.sourceKind === "string" ? !input.sourceText.trim() : !input.sourceFileId) {
    return failure(
      "missing_translation_source",
      input.sourceKind === "string" ? "Enter source text." : "Choose a stored source file.",
    );
  }

  const project = await loadProjectScope(input.organizationId, input.projectId);
  if (!project) return failure("project_not_found", "Choose a project in this organization.");
  const targetLocales = parseWorkflowList(input.targetLocales);
  if (targetLocales.length === 0) {
    return failure("target_locales_required", "Choose at least one target locale.");
  }
  const context = translationJobContext(input);
  if ((context?.length ?? 0) > MAX_TRANSLATION_JOB_CONTEXT_CHARS) {
    return failure("translation_context_too_large", "Translation context is too large.");
  }

  const { createTranslationJobEventQueue } = await import("@/lib/workflow/queues");
  const metadata = input.idempotencyKey ? { workflowStepKey: input.idempotencyKey } : undefined;
  const idempotency = input.idempotencyKey
    ? {
        key: input.idempotencyKey,
        requestHash: createHash("sha256")
          .update(
            JSON.stringify({
              sourceKind: input.sourceKind,
              projectId: input.projectId,
              sourceText: input.sourceKind === "string" ? input.sourceText : undefined,
              sourceFileId: input.sourceKind === "file" ? input.sourceFileId : undefined,
              sourceLocale: input.sourceLocale,
              targetLocales,
              context,
            }),
          )
          .digest("hex"),
      }
    : undefined;
  if (input.sourceKind === "string") {
    const { enqueueStringTranslationJob } =
      await import("@/lib/projects/jobs/enqueue-string-translation-job");
    const result = await enqueueStringTranslationJob({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceText: input.sourceText,
      sourceLocale: input.sourceLocale,
      targetLocales,
      context,
      metadata,
      idempotency,
      jobQueue: createTranslationJobEventQueue(),
    });
    if (!result.ok) return failure(result.code, result.message);
    return {
      ok: true,
      output: {
        jobId: result.jobId,
        status: result.status,
        targetLocales,
        createdAt: result.createdAt.toISOString(),
      },
    };
  }

  const { enqueueFileTranslationJob } =
    await import("@/lib/projects/jobs/enqueue-file-translation-job");
  const result = await enqueueFileTranslationJob({
    organizationId: input.organizationId,
    projectId: input.projectId,
    assigneeType: "agent",
    sourceFileId: input.sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales,
    context,
    metadata,
    idempotency,
    jobQueue: createTranslationJobEventQueue(),
  });
  if (!result.ok) return failure(result.code, result.message);
  const created = await jobMetadata(input.organizationId, result.jobId);
  if (!created) return failure("translation_job_not_found", "The created job was not found.");
  return {
    ok: true,
    output: {
      jobId: result.jobId,
      status: created.status,
      targetLocales,
      createdAt: created.createdAt,
    },
  };
}

async function findJobForStep(input: {
  organizationId: string;
  projectId: string;
  idempotencyKey?: string;
}) {
  if (!input.idempotencyKey) return null;
  const [job] = await db
    .select({ id: schema.jobs.id, status: schema.jobs.status, dueAt: schema.jobs.dueAt })
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
    dueAt?: string;
    dueInHours?: number;
    afterJobId?: string;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.projectId || !input.sourceFileId) {
    return failure(
      "missing_task_config",
      "Choose a project and a source file before assigning a task.",
    );
  }
  const dueAt = resolveWorkflowDueAt(input);
  if (dueAt === undefined) return invalidDueDate();
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
        dueAt: existing.dueAt?.toISOString() ?? null,
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
    dueAt: dueAt ?? undefined,
    afterJobId: input.afterJobId || undefined,
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
      dueAt: dueAt?.toISOString() ?? null,
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

/** A For each runs at most this many items, so listing more would only fail the loop. */
const MAX_LISTED_SOURCE_FILES = 100;

export async function runListSourceFilesAction(
  input: ActionInput & { projectId: string; pathPrefix: string },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.projectId) {
    return failure("missing_list_files_config", "Choose a project to list.");
  }
  const project = await loadProjectScope(input.organizationId, input.projectId);
  if (!project) return failure("project_not_found", "Choose a project in this organization.");

  const versions = schema.repositorySourceFileVersions;
  const pathPrefix = input.pathPrefix.trim().replace(/^\/+/, "");
  const latestByFile = db
    .selectDistinctOn([versions.repositorySourceFileId], {
      sourceFileId: versions.storedFileId,
      path: versions.sourcePath,
    })
    .from(versions)
    .where(
      and(
        eq(versions.organizationId, input.organizationId),
        eq(versions.projectId, input.projectId),
        pathPrefix ? sql`starts_with(${versions.sourcePath}, ${pathPrefix})` : undefined,
      ),
    )
    .orderBy(versions.repositorySourceFileId, desc(versions.createdAt), desc(versions.id))
    .as("latest_source_files");
  const rows = await db
    .select({
      sourceFileId: latestByFile.sourceFileId,
      path: latestByFile.path,
    })
    .from(latestByFile)
    .orderBy(latestByFile.path)
    .limit(MAX_LISTED_SOURCE_FILES + 1);
  const truncated = rows.length > MAX_LISTED_SOURCE_FILES;
  const files = truncated ? rows.slice(0, MAX_LISTED_SOURCE_FILES) : rows;

  return {
    ok: true,
    output: {
      files,
      sourceFileIds: files.map((file) => file.sourceFileId),
      count: files.length,
      truncated,
    },
  };
}

export async function runUpdateJobAction(
  input: ActionInput & {
    jobId: string;
    assigneeWorkosUserId: string;
    title: string;
    dueAt?: string;
    dueInHours?: number;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.jobId) {
    return failure("missing_update_job_config", "Choose the job to update.");
  }
  const title = input.title.trim();
  const dueAt = resolveWorkflowDueAt(input);
  if (dueAt === undefined) return invalidDueDate();
  if (!input.assigneeWorkosUserId && !title && !dueAt) {
    return failure(
      "missing_update_job_change",
      "Choose an assignee, a new title or a due date for the job.",
    );
  }

  const { updateNativeJob } = await import("@/lib/projects/jobs/update-native-job");
  const result = await updateNativeJob({
    organizationId: input.organizationId,
    jobId: input.jobId,
    body: {
      ...(input.assigneeWorkosUserId ? { ownerWorkosUserId: input.assigneeWorkosUserId } : {}),
      ...(title ? { title } : {}),
      ...(dueAt ? { dueAt: dueAt.toISOString() } : {}),
    },
    accessWhere: eq(schema.jobs.organizationId, input.organizationId),
  });
  if (isErr(result)) {
    const error = result.error;
    return failure(
      error.code,
      error.code === "job_not_found" ? "The job to update was not found." : error.message,
    );
  }

  return {
    ok: true,
    output: {
      jobId: result.value.id,
      assigned: Boolean(input.assigneeWorkosUserId),
      renamed: Boolean(title),
      dueAt: dueAt?.toISOString() ?? null,
    },
  };
}

/**
 * What a Run QA step checks: the file and languages it names, or else those of its job. Nothing
 * named checks the whole project.
 */
async function resolveQaScope(
  input: ActionInput & {
    projectId: string;
    sourceFileId: string;
    targetLocales: unknown;
    jobId: string;
  },
): Promise<
  | { ok: true; scope: TranslationQaScanScope | undefined; targetLocales: string[] }
  | { ok: false; result: VisualWorkflowNodeExecutionResult }
> {
  let sourceFileId = input.sourceFileId;
  let targetLocales = parseWorkflowList(input.targetLocales);
  let branchName: string | undefined;
  let boundRepositorySourceFileId: string | undefined;
  if (input.jobId) {
    const [job] = await db
      .select({
        projectId: schema.jobs.projectId,
        sourceFileId: sql<string | null>`${schema.jobs.inputPayload} ->> 'sourceFileId'`,
        branch: sql<string | null>`${schema.jobs.inputPayload} ->> 'branch'`,
        targetLocales: sql<unknown>`${schema.jobs.inputPayload} -> 'targetLocales'`,
        repositorySourceFileId: schema.repositorySourceFileVersions.repositorySourceFileId,
      })
      .from(schema.jobs)
      .leftJoin(
        schema.translationJobDetails,
        eq(schema.translationJobDetails.jobId, schema.jobs.id),
      )
      .leftJoin(
        schema.repositorySourceFileVersions,
        and(
          eq(
            schema.repositorySourceFileVersions.id,
            schema.translationJobDetails.sourceFileVersionId,
          ),
          eq(schema.repositorySourceFileVersions.organizationId, schema.jobs.organizationId),
          eq(schema.repositorySourceFileVersions.projectId, schema.jobs.projectId),
        ),
      )
      .where(
        and(eq(schema.jobs.organizationId, input.organizationId), eq(schema.jobs.id, input.jobId)),
      )
      .limit(1);
    if (!job || job.projectId !== input.projectId) {
      return {
        ok: false,
        result: failure("job_not_found", "The job to check was not found in this project."),
      };
    }
    sourceFileId ||= job.sourceFileId ?? "";
    branchName = job.branch?.trim() || undefined;
    // The stored file id is shared after a clone. The version the job was made
    // for names the branch whose strings this scan must check.
    if (!input.sourceFileId) {
      boundRepositorySourceFileId = job.repositorySourceFileId ?? undefined;
    }
    if (targetLocales.length === 0) targetLocales = parseWorkflowList(job.targetLocales);
  }

  let repositorySourceFileId: string | undefined;
  if (boundRepositorySourceFileId) {
    repositorySourceFileId = boundRepositorySourceFileId;
  } else if (sourceFileId) {
    const version = await getRepositorySourceFileVersionForStoredFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      fileId: sourceFileId,
      branchName,
    });
    if (!version) {
      return {
        ok: false,
        result: failure(
          "source_file_not_ingested",
          "The source file has no strings in this project yet.",
        ),
      };
    }
    repositorySourceFileId = version.repositorySourceFileId;
  }

  const scope =
    repositorySourceFileId || targetLocales.length > 0
      ? {
          ...(repositorySourceFileId ? { repositorySourceFileId } : {}),
          ...(targetLocales.length > 0 ? { targetLocales } : {}),
        }
      : undefined;
  return { ok: true, scope, targetLocales };
}

const QA_BUSY_WAIT_MS = 3 * 60 * 1000;
const QA_BUSY_POLL_MS = 5000;

/** How Run QA waits for another scan; tests replace it so they do not wait. */
export const qaBusyWait = {
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/** Why a Run QA step asks for human review, in the order they are reported. */
export type QaReviewReason = "domain_requires_review" | "qa_failed" | "low_estimated_quality";

/**
 * Whether a Run QA step passes, and whether its work needs a person before it ships. With
 * quality scoring on, the score decides `passed`: every checked language reaches the threshold
 * and has no critical error. Without it, any error fails.
 *
 * `needsHumanReview` is true when QA did not pass, when the quality estimate flagged segments,
 * or when the project's content domain (medical, legal, financial) always requires review.
 */
export function qaRunOutcome(input: {
  errorCount: number;
  quality?: TranslationQaQuality;
  estimation?: TranslationQaEstimationSummary;
  domain?: QaDomain;
}) {
  const { quality, estimation } = input;
  const passed = quality ? quality.passed : input.errorCount === 0;
  const reviewReasons: QaReviewReason[] = [];
  if (input.domain && QA_DOMAIN_PROFILES[input.domain].requiresHumanReview) {
    reviewReasons.push("domain_requires_review");
  }
  if (!passed) reviewReasons.push("qa_failed");
  if (estimation && estimation.belowThresholdCount > 0) {
    reviewReasons.push("low_estimated_quality");
  }
  return {
    passed,
    qualityScore: quality ? quality.score : null,
    qualityThreshold: quality ? quality.threshold : null,
    qualityByLocale: quality
      ? Object.fromEntries(
          Object.entries(quality.byLocale).map(([locale, row]) => [
            locale,
            { score: row.score, passed: row.passed },
          ]),
        )
      : null,
    estimatedQualityScore: estimation ? estimation.averageScore : null,
    reviewSegmentCount: estimation ? estimation.belowThresholdCount : 0,
    needsHumanReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

export async function runQaChecksAction(
  input: ActionInput & {
    mode?: "project" | "inline";
    projectId: string;
    sourceFileId?: string;
    targetLocales?: unknown;
    jobId?: string;
    source?: string;
    translation?: string;
    sourceLocale?: string;
    targetLocale?: string;
    projectPolicies?: Record<string, unknown>;
    glossaryReferences?: Record<string, unknown>[];
    translationMemoryReferences?: Record<string, unknown>[];
    selectedChecks?: TranslationQaCheckType[];
    signal?: AbortSignal;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (!input.projectId) {
    return failure("missing_qa_config", "Choose a project to check.");
  }
  if (input.mode === "inline") return runInlineQaChecksAction(input);
  const resolved = await resolveQaScope({
    ...input,
    sourceFileId: input.sourceFileId ?? "",
    targetLocales: input.targetLocales ?? "",
    jobId: input.jobId ?? "",
  });
  if (!resolved.ok) return resolved.result;

  const { runProjectTranslationQaScan } = await import("@/lib/qa/run-project-qa-scan");
  let scan: Awaited<ReturnType<typeof runProjectTranslationQaScan>>;
  try {
    // One scan runs per project at a time. Several runs finishing together (a task per language)
    // would collide, so wait for the other scan instead of failing at once.
    const busyUntil = Date.now() + QA_BUSY_WAIT_MS;
    for (;;) {
      scan = await runProjectTranslationQaScan({
        organizationId: input.organizationId,
        projectId: input.projectId,
        trigger: "manual",
        scope: resolved.scope,
      });
      if (scan.ok || scan.code !== "scan_in_progress" || Date.now() >= busyUntil) break;
      await qaBusyWait.sleep(QA_BUSY_POLL_MS);
    }
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
      summary: schema.translationQaRuns.summary,
    })
    .from(schema.translationQaRuns)
    .where(eq(schema.translationQaRuns.id, scan.runId))
    .limit(1);
  const errorCount = run?.errorCount ?? 0;

  return {
    ok: true,
    output: {
      runId: scan.runId,
      ...qaRunOutcome({
        errorCount,
        quality: run?.summary.quality,
        estimation: run?.summary.estimation,
        domain: run?.summary.qualityDomain,
      }),
      errorCount,
      warningCount: run?.warningCount ?? 0,
      findingCount: run?.findingCount ?? 0,
      targetLocales: resolved.targetLocales,
    },
  };
}

type InlineQaFinding = Pick<
  TranslationQaCheck,
  "checkType" | "severity" | "category" | "message"
> & {
  origin: "deterministic" | "model";
};

function inlineGlossaryTerms(
  references: readonly Record<string, unknown>[],
  targetLocale: string,
): TranslationQaGlossaryTerm[] {
  return references.flatMap((reference) => {
    if (typeof reference.sourceTerm !== "string" || typeof reference.targetTerm !== "string") {
      return [];
    }
    return [
      {
        sourceTerm: reference.sourceTerm,
        targetTerm: reference.targetTerm,
        targetLocale:
          typeof reference.targetLocale === "string" ? reference.targetLocale : targetLocale,
        forbidden: reference.forbidden === true,
        caseSensitive: reference.caseSensitive === true,
      },
    ];
  });
}

function optionalPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function evaluateInlineTranslationQa(input: {
  projectId: string;
  source: string;
  translation: string;
  sourceLocale: string;
  targetLocale: string;
  projectPolicies?: Record<string, unknown>;
  glossaryReferences?: Record<string, unknown>[];
  translationMemoryReferences?: Record<string, unknown>[];
  selectedChecks?: TranslationQaCheckType[];
}): VisualWorkflowNodeExecutionResult {
  const policies = input.projectPolicies ?? {};
  const selected = new Set(input.selectedChecks ?? []);
  const checks = validateTranslationSegment({
    sourceText: input.source,
    targetText: input.translation,
    targetLocale: input.targetLocale,
    maxLength: optionalPositiveNumber(policies.maxLength),
    glossaryTerms: inlineGlossaryTerms(input.glossaryReferences ?? [], input.targetLocale),
    placeholderPatterns: Array.isArray(policies.placeholderPatterns)
      ? policies.placeholderPatterns.filter((value): value is string => typeof value === "string")
      : undefined,
  }).filter((check) => selected.size === 0 || selected.has(check.checkType));

  const deterministicFindings: InlineQaFinding[] = checks.map((check) => ({
    checkType: check.checkType,
    severity: check.severity,
    category: check.category,
    message: redactedQaMessage(check.checkType),
    origin: "deterministic",
  }));
  // Model checks are intentionally not inferred from deterministic results. A project scan owns
  // provider calls; inline evaluation reports only findings it actually evaluated.
  const modelChecksSelected = [...selected].some((check) => MODEL_ASSISTED_QA_CHECKS.has(check));
  const findings = deterministicFindings.slice(0, MAX_INLINE_QA_FINDINGS);
  const errorCount = deterministicFindings.filter((finding) => finding.severity === "error").length;
  const warningCount = deterministicFindings.length - errorCount;
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        input.projectId,
        input.source,
        input.translation,
        input.sourceLocale,
        input.targetLocale,
      ]),
    )
    .digest("hex")
    .slice(0, 16);

  return {
    ok: true,
    output: {
      runId: `inline_${digest}`,
      ...qaRunOutcome({ errorCount }),
      errorCount,
      warningCount,
      findingCount: deterministicFindings.length,
      targetLocales: [input.targetLocale],
      findings,
      suggestedCorrections: findings.map((finding) => ({
        checkType: finding.checkType,
        message: finding.message,
      })),
      deterministicFindingCount: deterministicFindings.length,
      modelFindingCount: 0,
      findingsTruncated: deterministicFindings.length > findings.length,
      ...(modelChecksSelected ? { modelChecksSkipped: true } : {}),
    },
  };
}

/** Runs one bounded, side-effect-free QA evaluation for workflow-provided text. */
export async function runInlineQaChecksAction(
  input: ActionInput & {
    projectId: string;
    source?: string;
    translation?: string;
    sourceLocale?: string;
    targetLocale?: string;
    projectPolicies?: Record<string, unknown>;
    glossaryReferences?: Record<string, unknown>[];
    translationMemoryReferences?: Record<string, unknown>[];
    selectedChecks?: TranslationQaCheckType[];
    signal?: AbortSignal;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  if (input.signal?.aborted) return failure("qa_cancelled", "The QA evaluation was cancelled.");
  const source = input.source ?? "";
  const translation = input.translation ?? "";
  const sourceLocale = input.sourceLocale?.trim() ?? "";
  const targetLocale = input.targetLocale?.trim() ?? "";
  if (!source || !translation || !sourceLocale || !targetLocale) {
    return failure("missing_qa_config", "Provide source, translation and both locales.");
  }
  if (sourceLocale.toLowerCase() === targetLocale.toLowerCase()) {
    return failure("invalid_qa_locale_pair", "Source and target locales must be different.");
  }
  const project = await loadProjectScope(input.organizationId, input.projectId);
  if (!project) return failure("project_not_found", "Choose a project in this organization.");
  if (
    project.sourceLocale.toLowerCase() !== sourceLocale.toLowerCase() ||
    !project.targetLocales.some((locale) => locale.toLowerCase() === targetLocale.toLowerCase())
  ) {
    return failure("invalid_qa_locale_pair", "Choose locales configured for this project.");
  }
  if (input.signal?.aborted) return failure("qa_cancelled", "The QA evaluation was cancelled.");

  return evaluateInlineTranslationQa({
    projectId: input.projectId,
    source,
    translation,
    sourceLocale,
    targetLocale,
    projectPolicies: input.projectPolicies,
    glossaryReferences: input.glossaryReferences,
    translationMemoryReferences: input.translationMemoryReferences,
    selectedChecks: input.selectedChecks,
  });
}
