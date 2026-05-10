import { del, get, put } from "@vercel/blob";
import { and, eq, isNull, or } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { createStoredFileId, sha256Hex, storageKey } from "@/lib/file-storage/records";
import type { StringTranslationJobResult } from "@/lib/translation/string-job-executor";
import {
  claimTranslationJob,
  completeTranslationJob,
  executeClaimedTranslationJob,
  failTranslationJob,
  type ClaimedTranslationJob,
} from "@/lib/translation/translation-job-queued-function";
import type { TranslationJobEventData } from "@/lib/workflow/types";

export async function claimTranslationJobStep(input: {
  event: TranslationJobEventData;
  runId: string;
}) {
  "use step";
  return claimTranslationJob(input);
}

export async function executeClaimedTranslationJobStep(job: ClaimedTranslationJob) {
  "use step";
  return executeClaimedTranslationJob(job);
}

export async function completeTranslationJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  result: StringTranslationJobResult;
}) {
  "use step";
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
  return failTranslationJob(input);
}

export async function markEmailTranslationJobRunning(input: {
  jobId: string;
  workflowRunId: string;
}) {
  "use step";

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

export async function getStoredFileContentStep(fileId: string, organizationId: string) {
  "use step";

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

export async function completeFileTranslationJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  outputFiles: Array<{ fileId: string; locale: string; filename: string }>;
}) {
  "use step";

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
}
