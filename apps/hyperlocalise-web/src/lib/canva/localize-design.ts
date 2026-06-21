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
import type { CanvaDesignSegment, LocalizeCanvaDesignResult } from "./types";

const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 120;

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

async function waitForTranslationJob(input: { jobId: string; organizationId: string }) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const [job] = await db
      .select({
        id: schema.jobs.id,
        status: schema.jobs.status,
        lastError: schema.jobs.lastError,
        type: schema.translationJobDetails.type,
        outcomeKind: schema.translationJobDetails.outcomeKind,
        outcomePayload: schema.jobs.outcomePayload,
      })
      .from(schema.jobs)
      .leftJoin(
        schema.translationJobDetails,
        eq(schema.translationJobDetails.jobId, schema.jobs.id),
      )
      .where(
        and(eq(schema.jobs.id, input.jobId), eq(schema.jobs.organizationId, input.organizationId)),
      )
      .limit(1);

    if (!job) {
      throw new Error("translation_job_not_found");
    }

    if (job.status === "succeeded") {
      return job;
    }

    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.lastError ?? "translation_job_failed");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("translation_job_timed_out");
}

export async function localizeCanvaDesign(input: {
  organizationId: string;
  apiKeyId: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  designId: string;
  segments: CanvaDesignSegment[];
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<LocalizeCanvaDesignResult> {
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

  const completedJob = await waitForTranslationJob({
    jobId,
    organizationId: input.organizationId,
  });
  const outputFiles = publicJobOutputFiles(completedJob) ?? [];
  const translationsByLocale: Record<string, Record<string, string>> = {};

  for (const outputFile of outputFiles) {
    const { content } = await getStoredFileContent({
      organizationId: input.organizationId,
      projectId: project.id,
      fileId: outputFile.fileId,
    });
    const parsed = JSON.parse(content.toString("utf8")) as Record<string, unknown>;
    translationsByLocale[outputFile.locale] = parseTranslationFile(parsed);
  }

  return {
    jobId,
    translationsByLocale,
  };
}
