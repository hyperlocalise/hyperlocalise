import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import {
  formatUsageControlError,
  reserveUsageEvent,
  usageFeatureIds,
} from "@/lib/billing/usage-control";
import {
  ensureRepositorySourceFileVersionForStoredFile,
  getStoredFileForJobScope,
} from "@/lib/file-storage/records";
import { validateJobLocalesAgainstProject } from "@/lib/i18n/project-job-locales";
import { isErr } from "@/lib/primitives/result/results";
import {
  assertOrganizationCanEnqueueTranslationJobInTransaction,
  OrganizationJobBudgetExceededError,
} from "@/lib/security/organization-operation-budget";
import {
  inferSupportedTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

export type CreateFileTranslationJobInput = {
  organizationId: string;
  projectId: string;
  createdByUserId?: string | null;
  apiKeyId?: string | null;
  ownerUserId?: string | null;
  sourceFileId: string;
  sourceLocale: string;
  targetLocales: string[];
  fileFormat?: SupportedTranslationFileFormat;
  metadata?: Record<string, string>;
};

export type CreateFileTranslationJobResult =
  | {
      ok: true;
      jobId: string;
      projectId: string;
      sourceFileVersionId: string | null;
    }
  | { ok: false; code: string; message: string };

export type EnqueueFileTranslationJobInput = CreateFileTranslationJobInput & {
  jobQueue: JobQueue<TranslationJobEventData>;
};

export type EnqueueFileTranslationJobResult =
  | { ok: true; jobId: string }
  | { ok: false; code: string; message: string };

export type EnqueueExistingFileTranslationJobInput = {
  organizationId: string;
  jobId: string;
  jobQueue: JobQueue<TranslationJobEventData>;
};

export type EnqueueExistingFileTranslationJobResult =
  | { ok: true; jobId: string; projectId: string }
  | { ok: false; code: string; message: string };

async function markFileTranslationJobEnqueueFailed(input: {
  organizationId: string;
  jobId: string;
  projectId?: string | null;
  error: unknown;
}) {
  try {
    await db
      .update(schema.jobs)
      .set({
        status: "failed",
        lastError:
          input.error instanceof Error ? input.error.message : "translation job queue unavailable",
      })
      .where(
        and(
          eq(schema.jobs.organizationId, input.organizationId),
          eq(schema.jobs.id, input.jobId),
          ...(input.projectId ? [eq(schema.jobs.projectId, input.projectId)] : []),
        ),
      );
  } catch {
    // Best-effort cleanup; preserve the original enqueue failure response.
  }
}

async function enqueueFileTranslationJobEvent(input: {
  organizationId: string;
  jobId: string;
  projectId: string;
  jobQueue: JobQueue<TranslationJobEventData>;
}): Promise<EnqueueFileTranslationJobResult> {
  try {
    await input.jobQueue.enqueue({
      kind: "translation",
      jobId: input.jobId,
      projectId: input.projectId,
      type: "file",
    });

    return { ok: true, jobId: input.jobId };
  } catch (error) {
    await markFileTranslationJobEnqueueFailed({
      organizationId: input.organizationId,
      jobId: input.jobId,
      projectId: input.projectId,
      error,
    });

    return {
      ok: false,
      code: "translation_job_enqueue_failed",
      message: error instanceof Error ? error.message : "Unable to enqueue translation job.",
    };
  }
}

export async function createFileTranslationJob(
  input: CreateFileTranslationJobInput,
): Promise<CreateFileTranslationJobResult> {
  const [project] = await db
    .select({
      id: schema.projects.id,
      source: schema.projects.source,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!project) {
    return { ok: false, code: "project_not_found", message: "Project not found." };
  }

  const localeValidation = validateJobLocalesAgainstProject(project, {
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
  });
  if (isErr(localeValidation)) {
    return {
      ok: false,
      code: localeValidation.error.code,
      message: localeValidation.error.message,
    };
  }

  const sourceFile = await getStoredFileForJobScope({
    organizationId: input.organizationId,
    projectId: input.projectId,
    fileId: input.sourceFileId,
  });

  if (!sourceFile) {
    return { ok: false, code: "source_file_not_found", message: "Source file not found." };
  }

  const inferredFileFormat = inferSupportedTranslationFileFormat(sourceFile.filename);
  if (!inferredFileFormat) {
    return {
      ok: false,
      code: "unsupported_source_file_format",
      message: "Unsupported source file format.",
    };
  }

  const fileFormat = input.fileFormat ?? inferredFileFormat;
  if (fileFormat !== inferredFileFormat) {
    return {
      ok: false,
      code: "source_file_format_mismatch",
      message: "Source file format does not match the requested format.",
    };
  }

  const inputPayload = {
    sourceFileId: input.sourceFileId,
    fileFormat,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  const jobId = `job_${randomUUID()}`;

  try {
    const created = await db.transaction(async (tx) => {
      const jobBudget = await assertOrganizationCanEnqueueTranslationJobInTransaction(
        tx,
        input.organizationId,
      );
      if (isErr(jobBudget)) {
        throw new OrganizationJobBudgetExceededError(jobBudget.error);
      }

      const sourceFileVersion = await ensureRepositorySourceFileVersionForStoredFile({
        db: tx,
        organizationId: input.organizationId,
        projectId: input.projectId,
        fileId: input.sourceFileId,
      });

      const [createdJob] = await tx
        .insert(schema.jobs)
        .values({
          id: jobId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          createdByUserId: input.createdByUserId ?? null,
          apiKeyId: input.apiKeyId ?? null,
          ownerUserId: input.ownerUserId ?? null,
          kind: "translation",
          status: "queued",
          inputPayload,
        })
        .returning({
          id: schema.jobs.id,
          projectId: schema.jobs.projectId,
        });

      await tx.insert(schema.translationJobDetails).values({
        jobId,
        type: "file",
        sourceFileVersionId: sourceFileVersion?.id ?? null,
      });

      const usageEventResult = await reserveUsageEvent({
        db: tx,
        organizationId: input.organizationId,
        featureId: usageFeatureIds.translationJobs,
        operationKey: `job:${jobId}:translation_jobs`,
        source: "translation_job_create",
        jobId,
        quantity: 1,
      });
      if (isErr(usageEventResult)) {
        throw new Error(formatUsageControlError(usageEventResult.error));
      }

      return {
        jobId: createdJob.id,
        projectId: createdJob.projectId ?? input.projectId,
        sourceFileVersionId: sourceFileVersion?.id ?? null,
      };
    });

    return { ok: true, ...created };
  } catch (error) {
    if (error instanceof OrganizationJobBudgetExceededError) {
      return {
        ok: false,
        code: error.budgetError.code,
        message: error.budgetError.message,
      };
    }

    return {
      ok: false,
      code: "translation_job_create_failed",
      message: error instanceof Error ? error.message : "Unable to create translation job.",
    };
  }
}

export async function enqueueExistingFileTranslationJob(
  input: EnqueueExistingFileTranslationJobInput,
): Promise<EnqueueExistingFileTranslationJobResult> {
  const [job] = await db
    .select({
      id: schema.jobs.id,
      projectId: schema.jobs.projectId,
      kind: schema.jobs.kind,
      status: schema.jobs.status,
      type: schema.translationJobDetails.type,
      externalProviderKind: schema.externalJobDetails.providerKind,
    })
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
    .where(
      and(eq(schema.jobs.id, input.jobId), eq(schema.jobs.organizationId, input.organizationId)),
    )
    .limit(1);

  if (!job) {
    return { ok: false, code: "job_not_found", message: "Job not found." };
  }

  if (job.externalProviderKind) {
    return {
      ok: false,
      code: "native_job_required",
      message: "Only native file translation jobs can be assigned to the translation agent.",
    };
  }

  if (job.kind !== "translation" || job.type !== "file" || !job.projectId) {
    return {
      ok: false,
      code: "file_translation_job_required",
      message: "Only native file translation jobs can be assigned to the translation agent.",
    };
  }

  if (job.status === "running") {
    return {
      ok: false,
      code: "job_already_running",
      message: "Job is already running.",
    };
  }

  if (job.status !== "queued") {
    return {
      ok: false,
      code: "job_not_enqueueable",
      message: `Job status "${job.status}" cannot be assigned to the translation agent.`,
    };
  }

  const enqueued = await enqueueFileTranslationJobEvent({
    organizationId: input.organizationId,
    jobId: job.id,
    projectId: job.projectId,
    jobQueue: input.jobQueue,
  });
  if (!enqueued.ok) {
    return enqueued;
  }

  return { ok: true, jobId: job.id, projectId: job.projectId };
}

export async function enqueueFileTranslationJob(
  input: EnqueueFileTranslationJobInput,
): Promise<EnqueueFileTranslationJobResult> {
  const created = await createFileTranslationJob(input);
  if (!created.ok) {
    return created;
  }

  return enqueueFileTranslationJobEvent({
    organizationId: input.organizationId,
    jobId: created.jobId,
    projectId: created.projectId,
    jobQueue: input.jobQueue,
  });
}
