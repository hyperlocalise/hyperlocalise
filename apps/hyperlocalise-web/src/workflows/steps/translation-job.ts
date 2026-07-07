import type { StringTranslationJobResult } from "@/lib/translation/domain";
import type { ClaimedTranslationJob } from "@/lib/translation/jobs";
import type { TranslationJobEventData } from "@/lib/workflow/types";

export async function claimTranslationJobStep(input: {
  event: TranslationJobEventData;
  runId: string;
}) {
  "use step";
  const { claimTranslationJob } = await import("@/lib/translation/jobs");
  return claimTranslationJob(input);
}

export async function executeClaimedTranslationJobStep(job: ClaimedTranslationJob) {
  "use step";
  const { executeClaimedTranslationJob } = await import("@/lib/translation/jobs");
  return executeClaimedTranslationJob(job);
}

export async function completeTranslationJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  result: StringTranslationJobResult;
}) {
  "use step";
  const { completeTranslationJob } = await import("@/lib/translation/jobs");
  return completeTranslationJob(input);
}

export async function failTranslationJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  code: string;
  message: string;
}) {
  "use step";
  const { failTranslationJob } = await import("@/lib/translation/jobs");
  return failTranslationJob(input);
}

export async function markEmailTranslationJobRunning(input: {
  jobId: string;
  workflowRunId: string;
}) {
  "use step";
  const { and, eq, isNull, or } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database");

  const [updatedJob] = await db
    .update(schema.jobs)
    .set({
      status: "running",
      workflowRunId: input.workflowRunId,
      lastError: null,
      outcomePayload: null,
      completedAt: null,
    })
    .where(
      and(
        eq(schema.jobs.id, input.jobId),
        eq(schema.jobs.kind, "translation"),
        or(isNull(schema.jobs.workflowRunId), eq(schema.jobs.workflowRunId, input.workflowRunId)),
        // Do not claim terminal jobs: legacy rows may have null workflowRunId, and replays must not
        // reset succeeded/failed jobs that already share this workflowRunId.
        or(eq(schema.jobs.status, "queued"), eq(schema.jobs.status, "running")),
      ),
    )
    .returning({ id: schema.jobs.id });

  if (!updatedJob) {
    throw new Error(
      `translation job ${input.jobId} is not owned by workflow run ${input.workflowRunId}`,
    );
  }
}

export async function markEmailTranslationJobSucceeded(input: {
  jobId: string;
  workflowRunId: string;
  sourceFilename: string;
  outputFilename: string;
  targetLocale: string;
}) {
  "use step";
  const { and, eq } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database");

  await db.transaction(async (tx) => {
    const [updatedJob] = await tx
      .update(schema.jobs)
      .set({
        status: "succeeded",
        outcomePayload: {
          kind: "email_file_result",
          sourceFilename: input.sourceFilename,
          outputFilename: input.outputFilename,
          targetLocale: input.targetLocale,
        },
        lastError: null,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schema.jobs.id, input.jobId),
          eq(schema.jobs.kind, "translation"),
          eq(schema.jobs.workflowRunId, input.workflowRunId),
        ),
      )
      .returning({ id: schema.jobs.id });

    if (!updatedJob) {
      throw new Error(
        `translation job ${input.jobId} is not owned by workflow run ${input.workflowRunId}`,
      );
    }

    await tx
      .update(schema.translationJobDetails)
      .set({ outcomeKind: "file_result" })
      .where(eq(schema.translationJobDetails.jobId, input.jobId));
  });
}

export async function markEmailTranslationJobFailed(input: {
  jobId: string;
  workflowRunId: string;
  reason: string;
}) {
  "use step";
  const { and, eq } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database");

  await db.transaction(async (tx) => {
    const [updatedJob] = await tx
      .update(schema.jobs)
      .set({
        status: "failed",
        outcomePayload: {
          kind: "email_file_error",
          message: input.reason,
        },
        lastError: input.reason,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schema.jobs.id, input.jobId),
          eq(schema.jobs.kind, "translation"),
          eq(schema.jobs.workflowRunId, input.workflowRunId),
        ),
      )
      .returning({ id: schema.jobs.id });

    if (!updatedJob) {
      throw new Error(
        `translation job ${input.jobId} is not owned by workflow run ${input.workflowRunId}`,
      );
    }

    await tx
      .update(schema.translationJobDetails)
      .set({ outcomeKind: "error" })
      .where(eq(schema.translationJobDetails.jobId, input.jobId));
  });
}

export async function getProjectOrganizationStep(projectId: string): Promise<string> {
  "use step";
  const { eq } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database");

  const [project] = await db
    .select({ organizationId: schema.projects.organizationId })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new Error(`project ${projectId} not found`);
  }

  return project.organizationId;
}

export async function getStoredFileStep(fileId: string, organizationId: string) {
  "use step";
  const { and, eq } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database");

  const [file] = await db
    .select()
    .from(schema.storedFiles)
    .where(
      and(eq(schema.storedFiles.id, fileId), eq(schema.storedFiles.organizationId, organizationId)),
    )
    .limit(1);

  if (!file) {
    throw new Error(`stored file ${fileId} not found`);
  }

  return file;
}

export async function getRepositorySourcePathForStoredFileStep(
  fileId: string,
  organizationId: string,
) {
  "use step";
  const { getRepositorySourceFileVersionForStoredFile } =
    await import("@/lib/file-storage/records");
  const version = await getRepositorySourceFileVersionForStoredFile({
    fileId,
    organizationId,
  });

  return version?.sourcePath ?? null;
}

export async function getStoredFileContentStep(fileId: string, organizationId: string) {
  "use step";
  const { get } = await import("@vercel/blob");
  const { and, eq } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database");
  const { env } = await import("@/lib/env");

  const [file] = await db
    .select({ storageKey: schema.storedFiles.storageKey })
    .from(schema.storedFiles)
    .where(
      and(eq(schema.storedFiles.id, fileId), eq(schema.storedFiles.organizationId, organizationId)),
    )
    .limit(1);

  if (!file) {
    throw new Error(`stored file ${fileId} not found`);
  }

  const storedObject = await get(file.storageKey, {
    access: env.FILE_STORAGE_ACCESS,
    token: env.BLOB_READ_WRITE_TOKEN,
  });

  if (!storedObject?.stream) {
    throw new Error(`stored file ${fileId} content not found`);
  }

  const arrayBuffer = await new Response(storedObject.stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function storeOutputFileStep(input: {
  organizationId: string;
  projectId: string;
  jobId: string;
  filename: string;
  contentType: string;
  content: Buffer;
}) {
  "use step";
  const { del, put } = await import("@vercel/blob");
  const { db, schema } = await import("@/lib/database");
  const { env } = await import("@/lib/env");
  const { createStoredFileId, sha256Hex, storageKey } = await import("@/lib/file-storage/records");

  const id = createStoredFileId();
  const key = storageKey({
    organizationId: input.organizationId,
    projectId: input.projectId,
    id,
    filename: input.filename,
  });
  const uploaded = await put(key, input.content, {
    access: env.FILE_STORAGE_ACCESS,
    addRandomSuffix: false,
    contentType: input.contentType,
    token: env.BLOB_READ_WRITE_TOKEN,
  });

  try {
    const [file] = await db
      .insert(schema.storedFiles)
      .values({
        id,
        organizationId: input.organizationId,
        projectId: input.projectId,
        createdByUserId: null,
        role: "output",
        sourceKind: "job_output",
        sourceInteractionId: null,
        sourceJobId: input.jobId,
        storageProvider: "vercel_blob",
        storageKey: uploaded.pathname,
        storageUrl: uploaded.url,
        downloadUrl: uploaded.downloadUrl ?? null,
        filename: input.filename,
        contentType: uploaded.contentType,
        byteSize: input.content.byteLength,
        sha256: await sha256Hex(input.content),
        etag: uploaded.etag ?? null,
        metadata: {},
      })
      .returning();

    if (!file) {
      throw new Error(`failed to create stored file record for ${input.filename}`);
    }

    return file;
  } catch (error) {
    await del(uploaded.pathname, { token: env.BLOB_READ_WRITE_TOKEN });
    throw error;
  }
}

export async function reuseFileTranslationMemoryEntriesStep(input: {
  projectId: string;
  sourceLocale: string;
  targetLocale: string;
  sourceEntries: Record<string, string>;
}) {
  "use step";
  const { reuseFileTranslationMemoryEntries } = await import("@/lib/translation/file-memory");
  return reuseFileTranslationMemoryEntries(input);
}

export async function loadProjectTranslationsAsPrefilledEntriesStep(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
}) {
  "use step";
  const { loadProjectTranslationsAsPrefilledEntries } =
    await import("@/lib/projects/translations/project-translation-service");
  return loadProjectTranslationsAsPrefilledEntries(input);
}

export async function persistFileTranslationMemoryEntriesStep(input: {
  projectId: string;
  jobId: string;
  sourceLocale: string;
  targetLocale: string;
  sourcePath: string;
  sourceFileHash: string;
  sourceEntries: Record<string, string>;
  targetEntries: Record<string, string>;
}) {
  "use step";
  const { persistFileTranslationMemoryEntries } = await import("@/lib/translation/file-memory");
  return persistFileTranslationMemoryEntries(input);
}

export async function persistFileProjectTranslationsStep(input: {
  organizationId: string;
  projectId: string;
  jobId: string;
  sourcePath: string;
  sourceLocale: string;
  targetLocale: string;
  sourceEntries: Record<string, string>;
  targetEntries: Record<string, string>;
}) {
  "use step";
  const { persistFileJobTranslations } =
    await import("@/lib/projects/translations/project-translation-service");
  return persistFileJobTranslations(input);
}

export async function completeFileTranslationJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  outputFiles: Array<{ fileId: string; locale: string; filename: string }>;
}) {
  "use step";
  const { and, eq } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database");

  const didSucceed = await db.transaction(async (tx) => {
    const [updatedJob] = await tx
      .update(schema.jobs)
      .set({
        status: "succeeded",
        outcomePayload: {
          outputFiles: input.outputFiles,
        },
        lastError: null,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schema.jobs.kind, "translation"),
          eq(schema.jobs.id, input.jobId),
          eq(schema.jobs.projectId, input.projectId),
          eq(schema.jobs.workflowRunId, input.workflowRunId),
        ),
      )
      .returning({ id: schema.jobs.id });

    if (!updatedJob) {
      return false;
    }

    await tx
      .update(schema.translationJobDetails)
      .set({ outcomeKind: "file_result" })
      .where(eq(schema.translationJobDetails.jobId, input.jobId));

    return true;
  });

  if (!didSucceed) {
    throw new Error(
      `translation job ${input.jobId} is not owned by workflow run ${input.workflowRunId}`,
    );
  }

  const {
    formatUsageControlError,
    markUsageEventSucceededByOperationKey,
    trackUsageEventInAutumnByOperationKey,
  } = await import("@/lib/billing/usage-control");
  const { isErr } = await import("@/lib/primitives/result/results");
  const operationKey = `job:${input.jobId}:translation_jobs`;
  const markUsageResult = await markUsageEventSucceededByOperationKey({
    operationKey,
    quantity: 1,
    dimensions: {
      autumn_event_name: "translation_job.completed",
      unit: "job",
    },
  });

  if (isErr(markUsageResult)) {
    throw new Error(formatUsageControlError(markUsageResult.error));
  }

  const trackUsageResult = await trackUsageEventInAutumnByOperationKey({ operationKey });
  if (isErr(trackUsageResult)) {
    console.error("[file-translation-job] Autumn usage tracking failed after job succeeded", {
      jobId: input.jobId,
      operationKey,
      error: formatUsageControlError(trackUsageResult.error),
    });
  }
}
