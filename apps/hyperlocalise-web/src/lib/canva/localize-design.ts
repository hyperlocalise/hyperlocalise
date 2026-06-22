import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  resolveApiKeyTeamAccessContext,
  getAccessibleProjectForApiKey,
} from "@/api/auth/api-key-access";
import { db, schema } from "@/lib/database";
import {
  formatUsageControlError,
  reserveUsageEvent,
  usageFeatureIds,
} from "@/lib/billing/usage-control";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { getFileStorageAdapter } from "@/lib/file-storage";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  getStoredFileContent,
} from "@/lib/file-storage/records";
import { validateJobLocalesAgainstProject } from "@/lib/i18n/project-job-locales";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import { isErr } from "@/lib/primitives/result/results";
import { assertOrganizationCanEnqueueTranslationJob } from "@/lib/security/organization-operation-budget";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import { buildSourcePath, parseTranslationFile, segmentsToTranslationFile } from "./segment-file";
import type {
  CanvaDesignSegment,
  CanvaLocalizationStatus,
  StartCanvaLocalizationResult,
} from "./types";

type PublicJobOutputFile = {
  fileId: string;
  locale: string;
  filename: string;
};

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function publicJobOutputFiles(input: {
  type: string | null;
  outcomeKind: string | null;
  outcomePayload: unknown;
}): PublicJobOutputFile[] | null {
  if (input.type !== "file" || input.outcomeKind !== "file_result") {
    return null;
  }

  if (!input.outcomePayload || typeof input.outcomePayload !== "object") {
    return null;
  }

  const outputFiles = (input.outcomePayload as Record<string, unknown>).outputFiles;
  if (!Array.isArray(outputFiles)) {
    return null;
  }

  const parsed: PublicJobOutputFile[] = [];
  for (const value of outputFiles) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    if (
      !hasValue(candidate.fileId) ||
      !hasValue(candidate.locale) ||
      !hasValue(candidate.filename)
    ) {
      return null;
    }
    parsed.push({
      fileId: candidate.fileId,
      locale: candidate.locale,
      filename: candidate.filename,
    });
  }

  return parsed;
}

async function loadTranslationsByLocale(input: {
  organizationId: string;
  projectId: string;
  outputFiles: PublicJobOutputFile[];
}) {
  const translationsByLocale: Record<string, Record<string, string>> = {};

  for (const outputFile of input.outputFiles) {
    const { content } = await getStoredFileContent({
      organizationId: input.organizationId,
      projectId: input.projectId,
      fileId: outputFile.fileId,
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content.toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new Error("translation_output_parse_failed");
    }

    translationsByLocale[outputFile.locale] = parseTranslationFile(parsed);
  }

  return translationsByLocale;
}

function readCanvaConnectionIdFromJobInput(inputPayload: unknown): string | null {
  if (!inputPayload || typeof inputPayload !== "object") {
    return null;
  }

  const fileInput = (inputPayload as Record<string, unknown>).fileInput;
  if (!fileInput || typeof fileInput !== "object") {
    return null;
  }

  const metadata = (fileInput as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const canvaConnectionId = (metadata as Record<string, unknown>).canvaConnectionId;
  return typeof canvaConnectionId === "string" && canvaConnectionId.length > 0
    ? canvaConnectionId
    : null;
}

function isCanvaIntegrationJob(inputPayload: unknown) {
  if (!inputPayload || typeof inputPayload !== "object") {
    return false;
  }

  const fileInput = (inputPayload as Record<string, unknown>).fileInput;
  if (!fileInput || typeof fileInput !== "object") {
    return false;
  }

  const metadata = (fileInput as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  return (metadata as Record<string, unknown>).integration === "canva-app";
}

function assertCanvaConnectionJobAccess(input: {
  job: {
    projectId: string | null;
    apiKeyId: string | null;
    inputPayload: unknown;
  };
  canvaConnectionId: string;
  projectId: string;
  apiKeyId: string;
}) {
  if (input.job.projectId !== input.projectId || input.job.apiKeyId !== input.apiKeyId) {
    throw new Error("translation_job_not_found");
  }

  if (!isCanvaIntegrationJob(input.job.inputPayload)) {
    throw new Error("translation_job_not_found");
  }

  const storedConnectionId = readCanvaConnectionIdFromJobInput(input.job.inputPayload);
  if (storedConnectionId && storedConnectionId !== input.canvaConnectionId) {
    throw new Error("translation_job_not_found");
  }
}

async function getTranslationJobSnapshot(input: { jobId: string; organizationId: string }) {
  const [job] = await db
    .select({
      id: schema.jobs.id,
      status: schema.jobs.status,
      projectId: schema.jobs.projectId,
      apiKeyId: schema.jobs.apiKeyId,
      inputPayload: schema.jobs.inputPayload,
      lastError: schema.jobs.lastError,
      type: schema.translationJobDetails.type,
      outcomeKind: schema.translationJobDetails.outcomeKind,
      outcomePayload: schema.jobs.outcomePayload,
    })
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(
      and(eq(schema.jobs.id, input.jobId), eq(schema.jobs.organizationId, input.organizationId)),
    )
    .limit(1);

  if (!job) {
    throw new Error("translation_job_not_found");
  }

  return job;
}

export async function startCanvaLocalization(input: {
  organizationId: string;
  apiKeyId: string;
  canvaConnectionId: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  designId: string;
  segments: CanvaDesignSegment[];
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<StartCanvaLocalizationResult> {
  const [apiKey] = await db
    .select({
      id: schema.organizationApiKeys.id,
      organizationId: schema.organizationApiKeys.organizationId,
      createdByUserId: schema.organizationApiKeys.createdByUserId,
    })
    .from(schema.organizationApiKeys)
    .where(
      and(
        eq(schema.organizationApiKeys.id, input.apiKeyId),
        eq(schema.organizationApiKeys.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!apiKey) {
    throw new Error("canva_api_key_not_found");
  }

  const teamAccess = await resolveApiKeyTeamAccessContext({
    organizationId: apiKey.organizationId,
    createdByUserId: apiKey.createdByUserId,
  });
  if (!teamAccess) {
    throw new Error("canva_api_key_unauthorized");
  }

  const project = await getAccessibleProjectForApiKey(teamAccess, input.projectId);
  if (!project) {
    throw new Error("canva_project_not_found");
  }

  const localeValidation = validateJobLocalesAgainstProject(project, {
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
  });
  if (isErr(localeValidation)) {
    throw new Error(localeValidation.error.code);
  }

  const jobBudget = await assertOrganizationCanEnqueueTranslationJob(input.organizationId);
  if (isErr(jobBudget)) {
    throw new Error(jobBudget.error.code);
  }

  const sourcePath = buildSourcePath(input.designId);
  const translationFile = segmentsToTranslationFile(input.segments);
  const fileBody = JSON.stringify(translationFile, null, 2);
  const sourceHash = createHash("sha256").update(fileBody).digest("hex");
  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();

  let uploadedFile: typeof schema.storedFiles.$inferSelect | null = null;
  const { storedFile, version } = await db
    .transaction(async (tx) => {
      uploadedFile = await createStoredFile({
        organizationId: input.organizationId,
        projectId: project.id,
        role: "source",
        sourceKind: "repository_file",
        filename: `${input.designId}.json`,
        contentType: "application/json",
        content: Buffer.from(fileBody, "utf8"),
        metadata: {
          sourcePath,
          sourceHash,
          uploadSurface: "canva_integration",
          integration: "canva-app",
        },
        adapter,
        db: tx,
      });

      const createdVersion = await createRepositorySourceFileVersion({
        storedFile: uploadedFile,
        sourcePath,
        sourceHash,
        uploadedByApiKeyId: input.apiKeyId,
        uploadSurface: "canva_integration",
        db: tx,
      });

      return { storedFile: uploadedFile, version: createdVersion };
    })
    .catch(async (error) => {
      if (uploadedFile) {
        await adapter.delete({ keyOrUrl: uploadedFile.storageKey }).catch(() => {});
      }
      throw error;
    });

  void enqueueSourceFileIngestAfterUpload({
    organizationId: input.organizationId,
    projectId: project.id,
    storedFileId: storedFile.id,
    sourceFileVersionId: version.id,
    sourcePath,
    sourceHash,
  }).catch(() => {});

  const jobId = `job_${randomUUID()}`;
  await db.transaction(async (tx) => {
    await tx.insert(schema.jobs).values({
      id: jobId,
      organizationId: input.organizationId,
      projectId: project.id,
      kind: "translation",
      status: "queued",
      inputPayload: {
        type: "file",
        projectId: project.id,
        fileInput: {
          sourceFileId: storedFile.id,
          fileFormat: "json",
          sourceLocale: input.sourceLocale,
          targetLocales: input.targetLocales,
          metadata: {
            integration: "canva-app",
            canvaConnectionId: input.canvaConnectionId,
          },
        },
      },
      apiKeyId: input.apiKeyId,
    });

    await tx.insert(schema.translationJobDetails).values({
      jobId,
      type: "file",
      sourceFileVersionId: version.id,
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
  });

  if (input.jobQueue) {
    try {
      await input.jobQueue.enqueue({
        kind: "translation",
        jobId,
        projectId: project.id,
        type: "file",
      });
    } catch (error) {
      await db
        .update(schema.jobs)
        .set({
          status: "failed",
          lastError: error instanceof Error ? error.message : "translation job queue unavailable",
        })
        .where(eq(schema.jobs.id, jobId));
      throw new Error("translation_job_queue_unavailable");
    }
  }

  return { jobId };
}

export async function getCanvaLocalizationStatus(input: {
  jobId: string;
  organizationId: string;
  canvaConnectionId: string;
  projectId: string;
  apiKeyId: string;
}): Promise<CanvaLocalizationStatus> {
  const job = await getTranslationJobSnapshot(input);
  assertCanvaConnectionJobAccess({
    job,
    canvaConnectionId: input.canvaConnectionId,
    projectId: input.projectId,
    apiKeyId: input.apiKeyId,
  });

  if (job.status === "succeeded") {
    const projectId = job.projectId;
    if (!projectId) {
      throw new Error("translation_job_missing_project");
    }

    const outputFiles = publicJobOutputFiles(job) ?? [];
    const translationsByLocale = await loadTranslationsByLocale({
      organizationId: input.organizationId,
      projectId,
      outputFiles,
    });

    return {
      jobId: job.id,
      status: "succeeded",
      translationsByLocale,
    };
  }

  if (job.status === "failed" || job.status === "cancelled") {
    throw new Error(job.lastError ?? "translation_job_failed");
  }

  return {
    jobId: job.id,
    status: job.status === "running" ? "running" : "queued",
  };
}
