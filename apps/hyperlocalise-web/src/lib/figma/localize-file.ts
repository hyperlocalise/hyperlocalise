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

import { and, desc, eq } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { buildAccessibleJobsWhere, buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { db, schema } from "@/lib/database";
import type { FileStorageAdapter } from "@/lib/file-storage";
import { getFileStorageAdapter } from "@/lib/file-storage";
import {
  createStoredFile,
  getStoredFileContent,
  normalizeSourcePath,
} from "@/lib/file-storage/records";
import { validateJobLocalesAgainstProject } from "@/lib/i18n/project-job-locales";
import { isErr } from "@/lib/primitives/result/results";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import {
  buildFigmaSourcePath,
  parseTranslationFile,
  segmentsToTranslationFile,
} from "./segment-file";
import type {
  FigmaDesignSegment,
  FigmaLocalizationStatus,
  StartFigmaLocalizationResult,
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

function isFigmaIntegrationJob(inputPayload: unknown) {
  return readMetadataString(inputPayload, "integration") === "figma-plugin";
}

export async function getAccessibleFigmaProject(auth: ApiAuthContext, projectId: string) {
  const [project] = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      source: schema.projects.source,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.source, "native"),
        await buildAccessibleProjectsWhere(auth),
      ),
    )
    .limit(1);

  return project ?? null;
}

export async function startFigmaLocalization(input: {
  auth: ApiAuthContext;
  projectId: string;
  fileKey: string;
  pageId: string;
  fileName?: string;
  sourceLocale: string;
  targetLocales: string[];
  segments: FigmaDesignSegment[];
  generate: boolean;
  jobQueue: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<StartFigmaLocalizationResult> {
  const project = await getAccessibleFigmaProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("figma_project_not_found");
  }

  const localeValidation = validateJobLocalesAgainstProject(project, {
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
  });
  if (isErr(localeValidation)) {
    throw new Error(localeValidation.error.code);
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const sourcePath = buildFigmaSourcePath(input.fileKey, input.pageId);
  const translationFile = segmentsToTranslationFile(input.segments);
  if (Object.keys(translationFile).length === 0) {
    throw new Error("figma_no_text_segments");
  }

  const fileBody = JSON.stringify(translationFile, null, 2);
  const sourceHash = createHash("sha256").update(fileBody).digest("hex");
  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();
  const filename = `${input.fileName?.trim() || input.fileKey}.json`;

  const storedFile = await createStoredFile({
    organizationId,
    projectId: project.id,
    createdByUserId: input.auth.user.localUserId,
    role: "source",
    sourceKind: "repository_file",
    filename,
    contentType: "application/json",
    content: Buffer.from(fileBody, "utf8"),
    metadata: {
      sourcePath,
      sourceHash,
      uploadSurface: "figma_plugin",
      integration: "figma-plugin",
      figmaFileKey: input.fileKey,
      figmaPageId: input.pageId,
    },
    adapter,
  });

  const jobInput = {
    organizationId,
    projectId: project.id,
    createdByUserId: input.auth.user.localUserId,
    ownerUserId: input.auth.user.localUserId,
    sourceFileId: storedFile.id,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    metadata: {
      integration: "figma-plugin",
      figmaFileKey: input.fileKey,
      figmaPageId: input.pageId,
      sourcePath,
    },
  };

  const created = await createFileTranslationJob(jobInput);
  if (!created.ok) {
    throw new Error(created.code);
  }

  if (created.sourceFileVersionId) {
    void enqueueSourceFileIngestAfterUpload({
      organizationId,
      projectId: project.id,
      storedFileId: storedFile.id,
      sourceFileVersionId: created.sourceFileVersionId,
      sourcePath,
      sourceHash,
    }).catch(() => {});
  }

  if (input.generate) {
    const generated = await enqueueExistingFileTranslationJob({
      organizationId,
      jobId: created.jobId,
      jobQueue: input.jobQueue,
    });
    if (!generated.ok) {
      throw new Error(generated.code);
    }
  }

  return { jobId: created.jobId, generated: input.generate };
}

export async function generateFigmaLocalization(input: {
  auth: ApiAuthContext;
  jobId: string;
  jobQueue: JobQueue<TranslationJobEventData>;
}): Promise<{ jobId: string }> {
  const organizationId = input.auth.organization.localOrganizationId;
  const job = await getFigmaTranslationJobSnapshot({
    jobId: input.jobId,
    organizationId,
    auth: input.auth,
  });

  const generated = await enqueueExistingFileTranslationJob({
    organizationId,
    jobId: job.id,
    jobQueue: input.jobQueue,
  });
  if (!generated.ok) {
    throw new Error(generated.code);
  }

  return { jobId: generated.jobId };
}

async function getFigmaTranslationJobSnapshot(input: {
  jobId: string;
  organizationId: string;
  auth: ApiAuthContext;
}) {
  const accessibleJobsWhere = await buildAccessibleJobsWhere(input.auth);
  const [job] = await db
    .select({
      id: schema.jobs.id,
      status: schema.jobs.status,
      projectId: schema.jobs.projectId,
      inputPayload: schema.jobs.inputPayload,
      lastError: schema.jobs.lastError,
      type: schema.translationJobDetails.type,
      outcomeKind: schema.translationJobDetails.outcomeKind,
      outcomePayload: schema.jobs.outcomePayload,
    })
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(
      and(
        eq(schema.jobs.id, input.jobId),
        eq(schema.jobs.organizationId, input.organizationId),
        accessibleJobsWhere,
      ),
    )
    .limit(1);

  if (!job || !isFigmaIntegrationJob(job.inputPayload)) {
    throw new Error("translation_job_not_found");
  }

  return job;
}

export async function getFigmaLocalizationStatus(input: {
  auth: ApiAuthContext;
  jobId: string;
}): Promise<FigmaLocalizationStatus> {
  const job = await getFigmaTranslationJobSnapshot({
    jobId: input.jobId,
    organizationId: input.auth.organization.localOrganizationId,
    auth: input.auth,
  });

  if (job.status === "succeeded") {
    const projectId = job.projectId;
    if (!projectId) {
      throw new Error("translation_job_missing_project");
    }

    const outputFiles = publicJobOutputFiles(job) ?? [];
    const translationsByLocale = await loadTranslationsByLocale({
      organizationId: input.auth.organization.localOrganizationId,
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

export async function pullLatestFigmaTranslations(input: {
  auth: ApiAuthContext;
  projectId: string;
  fileKey: string;
  pageId: string;
}): Promise<
  | { jobId: null; status: "not_found" }
  | {
      jobId: string;
      status: "succeeded";
      translationsByLocale: Record<string, Record<string, string>>;
    }
> {
  const project = await getAccessibleFigmaProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("figma_project_not_found");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const sourcePath = normalizeSourcePath(buildFigmaSourcePath(input.fileKey, input.pageId));
  const accessibleJobsWhere = await buildAccessibleJobsWhere(input.auth);

  const [job] = await db
    .select({
      id: schema.jobs.id,
      projectId: schema.jobs.projectId,
      type: schema.translationJobDetails.type,
      outcomeKind: schema.translationJobDetails.outcomeKind,
      outcomePayload: schema.jobs.outcomePayload,
      inputPayload: schema.jobs.inputPayload,
    })
    .from(schema.repositorySourceFileVersions)
    .innerJoin(
      schema.translationJobDetails,
      eq(schema.translationJobDetails.sourceFileVersionId, schema.repositorySourceFileVersions.id),
    )
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.translationJobDetails.jobId))
    .where(
      and(
        eq(schema.repositorySourceFileVersions.organizationId, organizationId),
        eq(schema.repositorySourceFileVersions.projectId, project.id),
        eq(schema.repositorySourceFileVersions.sourcePath, sourcePath),
        accessibleJobsWhere,
        eq(schema.jobs.kind, "translation"),
        eq(schema.jobs.status, "succeeded"),
        eq(schema.translationJobDetails.type, "file"),
        eq(schema.translationJobDetails.outcomeKind, "file_result"),
      ),
    )
    .orderBy(desc(schema.repositorySourceFileVersions.createdAt), desc(schema.jobs.createdAt))
    .limit(1);

  if (!job || !isFigmaIntegrationJob(job.inputPayload) || !job.projectId) {
    return { jobId: null, status: "not_found" };
  }

  const outputFiles = publicJobOutputFiles(job) ?? [];
  const translationsByLocale = await loadTranslationsByLocale({
    organizationId,
    projectId: job.projectId,
    outputFiles,
  });

  return {
    jobId: job.id,
    status: "succeeded",
    translationsByLocale,
  };
}
