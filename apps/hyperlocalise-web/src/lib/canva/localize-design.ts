import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { isJobCreateAllowed } from "@/api/auth/capability-guards";
import { buildApiAuthContextForCanvaUser } from "@/api/auth/canva-oauth-access";
import type { CanvaOAuthSessionAuth } from "@/api/auth/canva-oauth";
import { ownedProjectWhere } from "@/api/auth/team-access";
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
import {
  assertOrganizationCanEnqueueTranslationJobInTransaction,
  OrganizationJobBudgetExceededError,
} from "@/lib/security/organization-operation-budget";
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

function assertCanvaUserJobAccess(input: {
  job: {
    projectId: string | null;
    createdByUserId: string | null;
    inputPayload: unknown;
  };
  userId: string;
  projectId: string;
}) {
  if (input.job.projectId !== input.projectId || input.job.createdByUserId !== input.userId) {
    throw new Error("translation_job_not_found");
  }

  if (!isCanvaIntegrationJob(input.job.inputPayload)) {
    throw new Error("translation_job_not_found");
  }
}

async function getTranslationJobSnapshot(input: { jobId: string; organizationId: string }) {
  const [job] = await db
    .select({
      id: schema.jobs.id,
      status: schema.jobs.status,
      projectId: schema.jobs.projectId,
      createdByUserId: schema.jobs.createdByUserId,
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
  session: CanvaOAuthSessionAuth;
  organizationId: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  designId: string;
  segments: CanvaDesignSegment[];
  canvaBrandId?: string;
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<StartCanvaLocalizationResult> {
  const auth = await buildApiAuthContextForCanvaUser({
    session: input.session,
    organizationId: input.organizationId,
  });

  if (!auth || !isJobCreateAllowed(auth.membership.role)) {
    throw new Error("canva_project_not_found");
  }

  const [project] = await db
    .select({
      id: schema.projects.id,
      source: schema.projects.source,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(await ownedProjectWhere(auth, input.projectId))
    .limit(1);

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

  const sourcePath = buildSourcePath(input.designId);
  const translationFile = segmentsToTranslationFile(input.segments);
  const fileBody = JSON.stringify(translationFile, null, 2);
  const sourceHash = createHash("sha256").update(fileBody).digest("hex");
  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();
  const jobId = `job_${randomUUID()}`;

  let uploadedFile: typeof schema.storedFiles.$inferSelect | null = null;
  let uploadedStorageKey: string | null = null;
  let storedFile: typeof schema.storedFiles.$inferSelect;
  let version: typeof schema.repositorySourceFileVersions.$inferSelect;
  try {
    const created = await db.transaction(async (tx) => {
      const jobBudget = await assertOrganizationCanEnqueueTranslationJobInTransaction(
        tx,
        input.organizationId,
      );
      if (isErr(jobBudget)) {
        throw new OrganizationJobBudgetExceededError(jobBudget.error);
      }

      uploadedFile = await createStoredFile({
        organizationId: input.organizationId,
        projectId: project.id,
        role: "source",
        sourceKind: "repository_file",
        filename: `${input.designId}.json`,
        contentType: "application/json",
        content: Buffer.from(fileBody, "utf8"),
        createdByUserId: input.session.user.localUserId,
        metadata: {
          sourcePath,
          sourceHash,
          uploadSurface: "canva_integration",
          integration: "canva-app",
        },
        adapter,
        db: tx,
      });
      uploadedStorageKey = uploadedFile.storageKey;

      const createdVersion = await createRepositorySourceFileVersion({
        storedFile: uploadedFile,
        sourcePath,
        sourceHash,
        uploadedByUserId: input.session.user.localUserId,
        uploadSurface: "canva_integration",
        db: tx,
      });

      await tx.insert(schema.jobs).values({
        id: jobId,
        organizationId: input.organizationId,
        projectId: project.id,
        createdByUserId: input.session.user.localUserId,
        kind: "translation",
        status: "queued",
        inputPayload: {
          type: "file",
          projectId: project.id,
          fileInput: {
            sourceFileId: uploadedFile.id,
            fileFormat: "json",
            sourceLocale: input.sourceLocale,
            targetLocales: input.targetLocales,
            metadata: {
              integration: "canva-app",
              canvaSessionId: input.session.sessionId,
              canvaBrandId: input.canvaBrandId ?? null,
            },
          },
        },
      });

      await tx.insert(schema.translationJobDetails).values({
        jobId,
        type: "file",
        sourceFileVersionId: createdVersion.id,
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

      return { storedFile: uploadedFile, version: createdVersion };
    });
    storedFile = created.storedFile;
    version = created.version;
  } catch (error) {
    if (uploadedStorageKey) {
      await adapter.delete({ keyOrUrl: uploadedStorageKey }).catch(() => {});
    }
    throw error;
  }

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

  void enqueueSourceFileIngestAfterUpload({
    organizationId: input.organizationId,
    projectId: project.id,
    storedFileId: storedFile.id,
    sourceFileVersionId: version.id,
    sourcePath,
    sourceHash,
  }).catch(() => {});

  return { jobId };
}

export async function getCanvaLocalizationStatus(input: {
  jobId: string;
  organizationId: string;
  userId: string;
  projectId: string;
}): Promise<CanvaLocalizationStatus> {
  const job = await getTranslationJobSnapshot(input);
  assertCanvaUserJobAccess({
    job,
    userId: input.userId,
    projectId: input.projectId,
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
