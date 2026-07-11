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

export type EnqueueFileTranslationJobInput = {
  organizationId: string;
  projectId: string;
  createdByUserId?: string | null;
  apiKeyId?: string | null;
  sourceFileId: string;
  sourceLocale: string;
  targetLocales: string[];
  fileFormat?: SupportedTranslationFileFormat;
  metadata?: Record<string, string>;
  jobQueue: JobQueue<TranslationJobEventData>;
};

export type EnqueueFileTranslationJobResult =
  | { ok: true; jobId: string }
  | { ok: false; code: string; message: string };

export async function enqueueFileTranslationJob(
  input: EnqueueFileTranslationJobInput,
): Promise<EnqueueFileTranslationJobResult> {
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
    const job = await db.transaction(async (tx) => {
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
          kind: "translation",
          status: "queued",
          inputPayload,
        })
        .returning();

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

      return createdJob;
    });

    await input.jobQueue.enqueue({
      kind: "translation",
      jobId: job.id,
      projectId: job.projectId ?? input.projectId,
      type: "file",
    });

    return { ok: true, jobId: job.id };
  } catch (error) {
    if (error instanceof OrganizationJobBudgetExceededError) {
      return {
        ok: false,
        code: error.budgetError.code,
        message: error.budgetError.message,
      };
    }

    try {
      await db
        .update(schema.jobs)
        .set({
          status: "failed",
          lastError: error instanceof Error ? error.message : "translation job queue unavailable",
        })
        .where(and(eq(schema.jobs.projectId, input.projectId), eq(schema.jobs.id, jobId)));
    } catch {
      // Best-effort cleanup; preserve the original enqueue failure response.
    }

    return {
      ok: false,
      code: "translation_job_enqueue_failed",
      message: error instanceof Error ? error.message : "Unable to enqueue translation job.",
    };
  }
}
