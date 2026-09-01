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

import { and, desc, eq, sql } from "drizzle-orm";

import {
  resolveApiKeyTeamAccessContext,
  getAccessibleProjectForApiKey,
} from "@/api/auth/api-key-access";
import { db, schema } from "@/lib/database/client";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import {
  createStoredFile,
  getStoredFileContent,
  normalizeSourcePath,
} from "@/lib/file-storage/records";
import { validateJobLocalesAgainstProject } from "@/lib/i18n/project-job-locales";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import { isErr } from "@/lib/primitives/result/results";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import { buildSourcePath, parseTranslationFile, segmentsToTranslationFile } from "./segment-file";
import type {
  CanvaCurrentJobResult,
  CanvaDesignJob,
  CanvaDesignSegment,
  CanvaJobStatusName,
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

/** Parses file-result outcome payloads for Canva pull/status responses. */
export function publicJobOutputFiles(input: {
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

function readMetadataString(inputPayload: unknown, key: string): string | null {
  if (!inputPayload || typeof inputPayload !== "object") {
    return null;
  }

  const payload = inputPayload as Record<string, unknown>;
  const nested = payload.fileInput;
  const metadataSource =
    nested && typeof nested === "object"
      ? (nested as Record<string, unknown>).metadata
      : payload.metadata;

  if (!metadataSource || typeof metadataSource !== "object") {
    return null;
  }

  const value = (metadataSource as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Reads the Canva connection id from nested or top-level metadata when present. */
export function readCanvaConnectionIdFromJobInput(inputPayload: unknown): string | null {
  return readMetadataString(inputPayload, "canvaConnectionId");
}

/** True when a translation job was created by the Canva app integration. */
export function isCanvaIntegrationJob(inputPayload: unknown) {
  return readMetadataString(inputPayload, "integration") === "canva-app";
}

export function canvaJobMatchesDesign(inputPayload: unknown, designId: string) {
  return (
    isCanvaIntegrationJob(inputPayload) &&
    readMetadataString(inputPayload, "canvaDesignId") === designId
  );
}

const CANVA_JOB_STATUSES = new Set<CanvaJobStatusName>([
  "queued",
  "running",
  "waiting_for_review",
  "succeeded",
  "failed",
  "cancelled",
]);

export function publicCanvaJobStatus(status: string): CanvaJobStatusName {
  if (CANVA_JOB_STATUSES.has(status as CanvaJobStatusName)) {
    return status as CanvaJobStatusName;
  }
  return "queued";
}

export function canvaJobHasPullableTranslations(status: CanvaJobStatusName) {
  return status === "succeeded" || status === "waiting_for_review";
}

function readJobTargetLocales(inputPayload: unknown): string[] {
  if (!inputPayload || typeof inputPayload !== "object") {
    return [];
  }

  const payload = inputPayload as Record<string, unknown>;
  const nested = payload.fileInput;
  const localesSource =
    nested && typeof nested === "object"
      ? (nested as Record<string, unknown>).targetLocales
      : payload.targetLocales;

  if (!Array.isArray(localesSource)) {
    return [];
  }
  return localesSource.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

type CanvaJobSnapshot = {
  id: string;
  status: string;
  projectId: string | null;
  apiKeyId: string | null;
  inputPayload: unknown;
  lastError: string | null;
  type: string | null;
  outcomeKind: string | null;
  outcomePayload: unknown;
};

function canvaJobSelectFields() {
  return {
    id: schema.jobs.id,
    status: schema.jobs.status,
    projectId: schema.jobs.projectId,
    apiKeyId: schema.jobs.apiKeyId,
    inputPayload: schema.jobs.inputPayload,
    lastError: schema.jobs.lastError,
    type: schema.translationJobDetails.type,
    outcomeKind: schema.translationJobDetails.outcomeKind,
    outcomePayload: schema.jobs.outcomePayload,
  };
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
    .select(canvaJobSelectFields())
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

async function toCanvaDesignJob(input: {
  job: CanvaJobSnapshot;
  organizationId: string;
}): Promise<CanvaDesignJob> {
  const projectId = input.job.projectId;
  if (!projectId) {
    throw new Error("translation_job_missing_project");
  }

  const status = publicCanvaJobStatus(input.job.status);
  const sourcePath =
    readMetadataString(input.job.inputPayload, "sourcePath") ??
    normalizeSourcePath(
      buildSourcePath(readMetadataString(input.job.inputPayload, "canvaDesignId") ?? "unknown"),
    );

  let translationsByLocale: Record<string, Record<string, string>> = {};
  if (canvaJobHasPullableTranslations(status)) {
    const outputFiles = publicJobOutputFiles(input.job) ?? [];
    if (outputFiles.length > 0) {
      translationsByLocale = await loadTranslationsByLocale({
        organizationId: input.organizationId,
        projectId,
        outputFiles,
      });
    }
  }

  return {
    jobId: input.job.id,
    status,
    projectId,
    sourcePath,
    targetLocales: readJobTargetLocales(input.job.inputPayload),
    lastError: input.job.lastError,
    translationsByLocale,
  };
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
  generate?: boolean;
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<StartCanvaLocalizationResult> {
  const generate = input.generate ?? Boolean(input.jobQueue);
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

  const sourcePath = buildSourcePath(input.designId);
  const translationFile = segmentsToTranslationFile(input.segments);
  if (Object.keys(translationFile).length === 0) {
    throw new Error("canva_no_text_segments");
  }

  const fileBody = JSON.stringify(translationFile, null, 2);
  const sourceHash = createHash("sha256").update(fileBody).digest("hex");
  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();

  const storedFile = await createStoredFile({
    organizationId: input.organizationId,
    projectId: project.id,
    createdByUserId: apiKey.createdByUserId,
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
      canvaDesignId: input.designId,
      canvaConnectionId: input.canvaConnectionId,
    },
    adapter,
  });

  const created = await createFileTranslationJob({
    organizationId: input.organizationId,
    projectId: project.id,
    createdByUserId: apiKey.createdByUserId,
    apiKeyId: input.apiKeyId,
    sourceFileId: storedFile.id,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    metadata: {
      integration: "canva-app",
      canvaConnectionId: input.canvaConnectionId,
      canvaDesignId: input.designId,
      sourcePath,
    },
  });
  if (!created.ok) {
    throw new Error(created.code);
  }

  if (created.sourceFileVersionId) {
    void enqueueSourceFileIngestAfterUpload({
      organizationId: input.organizationId,
      projectId: project.id,
      storedFileId: storedFile.id,
      sourceFileVersionId: created.sourceFileVersionId,
      sourcePath,
      sourceHash,
    }).catch(() => {});
  }

  if (generate) {
    if (!input.jobQueue) {
      throw new Error("translation_job_queue_unavailable");
    }

    const generated = await enqueueExistingFileTranslationJob({
      organizationId: input.organizationId,
      jobId: created.jobId,
      jobQueue: input.jobQueue,
    });
    if (!generated.ok) {
      throw new Error(generated.code);
    }
  }

  return {
    jobId: created.jobId,
    generated: generate,
    projectId: project.id,
    sourcePath,
  };
}

export async function generateCanvaLocalization(input: {
  organizationId: string;
  canvaConnectionId: string;
  projectId: string;
  apiKeyId: string;
  jobId: string;
  jobQueue: JobQueue<TranslationJobEventData>;
}): Promise<{ jobId: string }> {
  const job = await getTranslationJobSnapshot({
    jobId: input.jobId,
    organizationId: input.organizationId,
  });
  assertCanvaConnectionJobAccess({
    job,
    canvaConnectionId: input.canvaConnectionId,
    projectId: input.projectId,
    apiKeyId: input.apiKeyId,
  });

  const generated = await enqueueExistingFileTranslationJob({
    organizationId: input.organizationId,
    jobId: job.id,
    jobQueue: input.jobQueue,
  });
  if (!generated.ok) {
    throw new Error(generated.code);
  }

  return { jobId: generated.jobId };
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

  return toCanvaDesignJob({
    job,
    organizationId: input.organizationId,
  });
}

async function findLatestCanvaDesignJob(input: {
  organizationId: string;
  canvaConnectionId: string;
  projectId: string;
  apiKeyId: string;
  designId: string;
}): Promise<CanvaJobSnapshot | null> {
  const [job] = await db
    .select(canvaJobSelectFields())
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(
      and(
        eq(schema.jobs.organizationId, input.organizationId),
        eq(schema.jobs.kind, "translation"),
        eq(schema.jobs.projectId, input.projectId),
        eq(schema.jobs.apiKeyId, input.apiKeyId),
        sql`(
          ${schema.jobs.inputPayload}->'metadata'->>'canvaDesignId' = ${input.designId}
          OR ${schema.jobs.inputPayload}->'fileInput'->'metadata'->>'canvaDesignId' = ${input.designId}
        )`,
      ),
    )
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);

  if (!job || !canvaJobMatchesDesign(job.inputPayload, input.designId) || !job.projectId) {
    return null;
  }

  if (job.projectId !== input.projectId || job.apiKeyId !== input.apiKeyId) {
    return null;
  }

  const storedConnectionId = readCanvaConnectionIdFromJobInput(job.inputPayload);
  if (storedConnectionId && storedConnectionId !== input.canvaConnectionId) {
    return null;
  }

  return job;
}

export async function getCurrentCanvaDesignJob(input: {
  organizationId: string;
  canvaConnectionId: string;
  projectId: string;
  apiKeyId: string;
  designId: string;
}): Promise<CanvaCurrentJobResult> {
  const job = await findLatestCanvaDesignJob(input);
  if (!job) {
    return { job: null };
  }

  return {
    job: await toCanvaDesignJob({
      job,
      organizationId: input.organizationId,
    }),
  };
}

export async function pullLatestCanvaTranslations(input: {
  organizationId: string;
  canvaConnectionId: string;
  projectId: string;
  apiKeyId: string;
  designId: string;
}): Promise<{ jobId: null; status: "not_found" } | CanvaDesignJob> {
  const job = await findLatestCanvaDesignJob(input);
  if (!job) {
    return { jobId: null, status: "not_found" };
  }

  return toCanvaDesignJob({
    job,
    organizationId: input.organizationId,
  });
}
