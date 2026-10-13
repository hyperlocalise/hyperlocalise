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
import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  resolveApiKeyTeamAccessContext,
  getAccessibleProjectForApiKey,
} from "@/api/auth/api-key-access";
import { db, schema } from "@/lib/database/client";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  getStoredFileContent,
  normalizeSourcePath,
} from "@/lib/file-storage/records";
import { validateJobLocalesAgainstProject } from "@/lib/i18n/project-job-locales";
import { countNativeSourceWords } from "@/lib/projects/locale-progress/native-project-locale-progress";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import { isErr } from "@/lib/primitives/result/results";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import { slugifyCanvaDesignTitle } from "./names";
import {
  buildPageFileName,
  buildPageSourcePath,
  buildSourcePath,
  parseTranslationFile,
  normalizePageScopedTranslationKeys,
  segmentsToPageTranslationFile,
} from "./segment-file";
import type {
  CanvaCurrentJobResult,
  CanvaDesignJob,
  CanvaDesignSegment,
  CanvaJobStatusName,
  CanvaLocalePageStatus,
  CanvaLocaleStatus,
  CanvaLocalizationStatus,
  CollectCanvaDesignResult,
  CollectedCanvaPageFile,
  GenerateCanvaLocaleResult,
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

export function resolveCanvaJobLocales(input: {
  project: { sourceLocale: string | null; targetLocales: string[] };
  requestedTargetLocales?: string[];
}): { sourceLocale: string; targetLocales: string[] } {
  const sourceLocale = input.project.sourceLocale?.trim();
  if (!sourceLocale) {
    throw new Error("job_source_locale_not_in_project");
  }

  const projectTargets = input.project.targetLocales ?? [];
  const requested = input.requestedTargetLocales?.filter((locale) => locale.trim().length > 0);
  const targetLocales = requested && requested.length > 0 ? requested : projectTargets;

  return { sourceLocale, targetLocales };
}

type CanvaWorkContext = {
  apiKey: {
    id: string;
    organizationId: string;
    createdByUserId: string | null;
  };
  project: {
    id: string;
    source: "native" | "external_tms";
    sourceLocale: string | null;
    targetLocales: string[];
  };
};

async function resolveCanvaWorkContext(input: {
  organizationId: string;
  apiKeyId: string;
  projectId: string;
}): Promise<CanvaWorkContext> {
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

  return { apiKey, project };
}

function groupSegmentsByPage(segments: CanvaDesignSegment[]) {
  const pages = new Map<number, CanvaDesignSegment[]>();
  for (const segment of segments) {
    const existing = pages.get(segment.pageIndex) ?? [];
    existing.push(segment);
    pages.set(segment.pageIndex, existing);
  }
  return [...pages.entries()].toSorted(([left], [right]) => left - right);
}

function countTranslatedKeys(translations: Record<string, string>, total: number) {
  let translated = 0;
  for (const value of Object.values(translations)) {
    if (value.trim().length > 0) {
      translated += 1;
    }
  }
  return Math.min(translated, total);
}

function countTranslationFileWords(file: Record<string, string>, sourceLocale: string) {
  let words = 0;
  for (const text of Object.values(file)) {
    words += countNativeSourceWords(text, sourceLocale);
  }
  return words;
}

export function mergeEditorTranslationsOverOutputFile(
  outputFile: Record<string, string>,
  editorSegments: Record<string, string>,
): Record<string, string> {
  if (Object.keys(editorSegments).length === 0) {
    return outputFile;
  }

  const merged = { ...outputFile };
  for (const [key, value] of Object.entries(editorSegments)) {
    if (value.trim().length === 0) {
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

async function loadCanvaEditorTranslationsBySourcePath(input: {
  organizationId: string;
  projectId: string;
  locale: string;
  sourcePaths: string[];
}): Promise<Map<string, Record<string, string>>> {
  const byPath = new Map<string, Record<string, string>>();
  if (input.sourcePaths.length === 0) {
    return byPath;
  }

  const rows = await db
    .select({
      key: schema.projectTranslationKeys.key,
      text: schema.projectTranslations.text,
      sourcePath: schema.repositorySourceFiles.sourcePath,
    })
    .from(schema.projectTranslations)
    .innerJoin(
      schema.projectTranslationKeys,
      eq(schema.projectTranslations.translationKeyId, schema.projectTranslationKeys.id),
    )
    .innerJoin(
      schema.repositorySourceFiles,
      eq(schema.projectTranslationKeys.repositorySourceFileId, schema.repositorySourceFiles.id),
    )
    .where(
      and(
        eq(schema.projectTranslations.organizationId, input.organizationId),
        eq(schema.projectTranslations.projectId, input.projectId),
        eq(schema.projectTranslations.targetLocale, input.locale),
        inArray(schema.repositorySourceFiles.sourcePath, input.sourcePaths),
      ),
    );

  for (const row of rows) {
    if (row.text.trim().length === 0 || !row.sourcePath) {
      continue;
    }
    const segments = byPath.get(row.sourcePath) ?? {};
    segments[row.key] = row.text;
    byPath.set(row.sourcePath, segments);
  }

  return byPath;
}

function countTranslatedSourceWords(
  sourceFile: Record<string, string>,
  translations: Record<string, string>,
  sourceLocale: string,
) {
  let words = 0;
  for (const [key, sourceText] of Object.entries(sourceFile)) {
    if ((translations[key] ?? "").trim().length === 0) {
      continue;
    }
    words += countNativeSourceWords(sourceText, sourceLocale);
  }
  return words;
}

export function canvaApprovalPercent(approved: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.round((Math.min(approved, total) / total) * 100);
}

function fallbackApprovedSegmentCount(
  status: CanvaJobStatusName | "idle",
  translated: number,
  total: number,
) {
  if (status === "succeeded") {
    return translated > 0 ? translated : total;
  }
  return 0;
}

async function loadCanvaApprovedSegmentCounts(input: {
  organizationId: string;
  projectId: string;
  sourcePaths: string[];
}) {
  const approvedByLocale = new Map<string, number>();
  const approvedByLocaleAndPath = new Map<string, number>();
  if (input.sourcePaths.length === 0) {
    return { approvedByLocale, approvedByLocaleAndPath, hasIngestedKeys: false };
  }

  const rows = await db
    .select({
      locale: schema.projectTranslations.targetLocale,
      status: schema.projectTranslations.status,
      sourcePath: schema.repositorySourceFiles.sourcePath,
    })
    .from(schema.projectTranslationKeys)
    .innerJoin(
      schema.repositorySourceFiles,
      eq(schema.projectTranslationKeys.repositorySourceFileId, schema.repositorySourceFiles.id),
    )
    .innerJoin(
      schema.projectTranslations,
      eq(schema.projectTranslations.translationKeyId, schema.projectTranslationKeys.id),
    )
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        inArray(schema.repositorySourceFiles.sourcePath, input.sourcePaths),
      ),
    );

  for (const row of rows) {
    if (row.status !== "approved") {
      continue;
    }
    approvedByLocale.set(row.locale, (approvedByLocale.get(row.locale) ?? 0) + 1);
    const pathKey = `${row.locale}\0${row.sourcePath}`;
    approvedByLocaleAndPath.set(pathKey, (approvedByLocaleAndPath.get(pathKey) ?? 0) + 1);
  }

  return { approvedByLocale, approvedByLocaleAndPath, hasIngestedKeys: rows.length > 0 };
}

function parseStoredTranslationFile(content: Buffer) {
  try {
    const parsed: unknown = JSON.parse(content.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parseTranslationFile(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function buildCanvaSourceLocaleStatus(input: {
  locale: string;
  pages: CollectedCanvaPageFile[];
  sourceByPage: Map<number, Record<string, string>>;
  sourceLocale: string;
}): CanvaLocaleStatus {
  const localePages: CanvaLocalePageStatus[] = input.pages.map((page) => {
    const sourceFile = input.sourceByPage.get(page.pageIndex) ?? {};
    const wordCount =
      page.wordCount > 0
        ? page.wordCount
        : countTranslationFileWords(sourceFile, input.sourceLocale);
    return {
      pageIndex: page.pageIndex,
      sourcePath: page.sourcePath,
      jobId: null,
      status: "succeeded" as const,
      translated: page.segmentCount,
      total: page.segmentCount,
      translatedWords: wordCount,
      wordCount,
      approved: page.segmentCount,
    };
  });
  const translated = localePages.reduce((sum, page) => sum + page.translated, 0);
  const total = localePages.reduce((sum, page) => sum + page.total, 0);
  const translatedWords = localePages.reduce((sum, page) => sum + page.translatedWords, 0);
  const wordCount = localePages.reduce((sum, page) => sum + page.wordCount, 0);
  const approved = localePages.reduce((sum, page) => sum + page.approved, 0);

  return {
    locale: input.locale,
    isSource: true,
    status: localePages.length > 0 ? "succeeded" : "idle",
    translated,
    total,
    translatedWords,
    wordCount,
    percent: localePages.length > 0 ? 100 : 0,
    approved,
    approvedPercent: canvaApprovalPercent(approved, total),
    canAdd: localePages.length > 0,
    pages: localePages,
  };
}

function rollupLocaleStatus(
  pages: CanvaLocaleStatus["pages"],
): Pick<CanvaLocaleStatus, "status" | "canAdd"> {
  const statuses = pages.map((page) => page.status);
  const canAdd = pages.some(
    (page) => page.status === "succeeded" || page.status === "waiting_for_review",
  );
  if (statuses.some((status) => status === "queued" || status === "running")) {
    return { status: statuses.includes("running") ? "running" : "queued", canAdd };
  }
  if (statuses.some((status) => status === "failed")) {
    return { status: "failed", canAdd };
  }
  if (statuses.length > 0 && statuses.every((status) => status === "succeeded")) {
    return { status: "succeeded", canAdd };
  }
  if (statuses.some((status) => status === "waiting_for_review")) {
    return { status: "waiting_for_review", canAdd };
  }
  if (statuses.some((status) => status === "cancelled")) {
    return { status: "cancelled", canAdd };
  }
  return { status: "idle", canAdd };
}

export async function collectCanvaDesign(input: {
  organizationId: string;
  apiKeyId: string;
  canvaConnectionId: string;
  projectId: string;
  designId: string;
  designTitle?: string;
  segments: CanvaDesignSegment[];
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<CollectCanvaDesignResult> {
  const { apiKey, project } = await resolveCanvaWorkContext(input);
  const grouped = groupSegmentsByPage(input.segments);
  if (grouped.length === 0) {
    throw new Error("canva_no_text_segments");
  }

  const designSlug = slugifyCanvaDesignTitle(input.designTitle, input.designId);
  const collectBatchId = randomUUID();
  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();
  const pages: CollectedCanvaPageFile[] = [];

  for (const [pageIndex, pageSegments] of grouped) {
    const translationFile = segmentsToPageTranslationFile(pageSegments);
    if (Object.keys(translationFile).length === 0) {
      continue;
    }

    const filename = buildPageFileName(pageIndex);
    const sourcePath = buildPageSourcePath(designSlug, input.designId, pageIndex);
    const fileBody = JSON.stringify(translationFile, null, 2);
    const sourceHash = createHash("sha256").update(fileBody).digest("hex");
    const wordCount = countTranslationFileWords(
      translationFile,
      project.sourceLocale?.trim() || "en",
    );
    const storedFile = await createStoredFile({
      organizationId: input.organizationId,
      projectId: project.id,
      createdByUserId: apiKey.createdByUserId,
      role: "source",
      sourceKind: "repository_file",
      filename,
      contentType: "application/json",
      content: Buffer.from(fileBody, "utf8"),
      metadata: {
        sourcePath,
        sourceHash,
        uploadSurface: "canva_integration",
        integration: "canva-app",
        canvaDesignId: input.designId,
        canvaDesignSlug: designSlug,
        canvaPageIndex: pageIndex,
        canvaCollectBatchId: collectBatchId,
        canvaConnectionId: input.canvaConnectionId,
        segmentCount: Object.keys(translationFile).length,
        wordCount,
      },
      adapter,
    });

    const version = await createRepositorySourceFileVersion({
      storedFile,
      sourcePath,
      sourceHash,
      uploadedByApiKeyId: input.apiKeyId,
      uploadedByUserId: apiKey.createdByUserId,
      uploadSurface: "canva_integration",
    });

    void enqueueSourceFileIngestAfterUpload({
      organizationId: input.organizationId,
      projectId: project.id,
      storedFileId: storedFile.id,
      sourceFileVersionId: version.id,
      sourcePath,
      sourceHash,
    }).catch(() => {});

    pages.push({
      pageIndex,
      sourcePath,
      sourceFileId: storedFile.id,
      segmentCount: Object.keys(translationFile).length,
      wordCount,
    });
  }

  if (pages.length === 0) {
    throw new Error("canva_no_text_segments");
  }

  await db
    .update(schema.storedFiles)
    .set({
      metadata: sql`jsonb_set(coalesce(${schema.storedFiles.metadata}, '{}'::jsonb), '{canvaCollectBatchComplete}', 'true'::jsonb)`,
    })
    .where(
      and(
        eq(schema.storedFiles.organizationId, input.organizationId),
        inArray(
          schema.storedFiles.id,
          pages.map((page) => page.sourceFileId),
        ),
      ),
    );

  return {
    designSlug,
    projectId: project.id,
    pages,
  };
}

export function latestPublishedCanvaCollectBatchId(
  rows: Array<{ metadata: Record<string, unknown> }>,
): string | null {
  for (const row of rows) {
    const batchId = row.metadata.canvaCollectBatchId;
    if (typeof batchId === "string" && row.metadata.canvaCollectBatchComplete === true) {
      return batchId;
    }
  }
  return null;
}

async function listCollectedCanvaPageFiles(input: {
  organizationId: string;
  projectId: string;
  designId: string;
}): Promise<CollectedCanvaPageFile[]> {
  const rows = await db
    .select({
      id: schema.storedFiles.id,
      metadata: schema.storedFiles.metadata,
      createdAt: schema.storedFiles.createdAt,
    })
    .from(schema.storedFiles)
    .where(
      and(
        eq(schema.storedFiles.organizationId, input.organizationId),
        eq(schema.storedFiles.projectId, input.projectId),
        eq(schema.storedFiles.role, "source"),
        sql`${schema.storedFiles.metadata}->>'integration' = 'canva-app'`,
        sql`${schema.storedFiles.metadata}->>'canvaDesignId' = ${input.designId}`,
      ),
    )
    .orderBy(desc(schema.storedFiles.createdAt));

  const latestBatchId = latestPublishedCanvaCollectBatchId(rows);
  if (latestBatchId == null) {
    return [];
  }

  const latestByPage = new Map<number, CollectedCanvaPageFile>();
  for (const row of rows) {
    if (row.metadata.canvaCollectBatchId !== latestBatchId) {
      continue;
    }
    const pageIndex = row.metadata.canvaPageIndex;
    const sourcePath = row.metadata.sourcePath;
    if (
      typeof pageIndex !== "number" ||
      typeof sourcePath !== "string" ||
      latestByPage.has(pageIndex)
    ) {
      continue;
    }
    const segmentCount =
      typeof row.metadata.segmentCount === "number" ? row.metadata.segmentCount : 0;
    const wordCount = typeof row.metadata.wordCount === "number" ? row.metadata.wordCount : 0;
    latestByPage.set(pageIndex, {
      pageIndex,
      sourcePath,
      sourceFileId: row.id,
      segmentCount,
      wordCount,
    });
  }

  return [...latestByPage.values()].toSorted((left, right) => left.pageIndex - right.pageIndex);
}

async function createJobsForCollectedPages(input: {
  organizationId: string;
  apiKeyId: string;
  canvaConnectionId: string;
  projectId: string;
  designId: string;
  locales: { sourceLocale: string; targetLocales: string[] };
  pages: CollectedCanvaPageFile[];
  generate: boolean;
  jobQueue?: JobQueue<TranslationJobEventData>;
  createdByUserId: string | null;
}): Promise<string[]> {
  const jobIds: string[] = [];

  for (const page of input.pages) {
    const created = await createFileTranslationJob({
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      apiKeyId: input.apiKeyId,
      sourceFileId: page.sourceFileId,
      sourceLocale: input.locales.sourceLocale,
      targetLocales: input.locales.targetLocales,
      metadata: {
        integration: "canva-app",
        canvaConnectionId: input.canvaConnectionId,
        canvaDesignId: input.designId,
        canvaPageIndex: String(page.pageIndex),
        sourcePath: page.sourcePath,
      },
    });
    if (!created.ok) {
      throw new Error(created.code);
    }

    if (created.sourceFileVersionId) {
      void enqueueSourceFileIngestAfterUpload({
        organizationId: input.organizationId,
        projectId: input.projectId,
        storedFileId: page.sourceFileId,
        sourceFileVersionId: created.sourceFileVersionId,
        sourcePath: page.sourcePath,
        sourceHash: "",
      }).catch(() => {});
    }

    if (input.generate) {
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

    jobIds.push(created.jobId);
  }

  return jobIds;
}

export async function generateCanvaLocaleJobs(input: {
  organizationId: string;
  apiKeyId: string;
  canvaConnectionId: string;
  projectId: string;
  designId: string;
  targetLocales: string[];
  jobQueue: JobQueue<TranslationJobEventData>;
}): Promise<GenerateCanvaLocaleResult> {
  const { apiKey, project } = await resolveCanvaWorkContext(input);
  const locales = resolveCanvaJobLocales({
    project,
    requestedTargetLocales: input.targetLocales,
  });
  const localeValidation = validateJobLocalesAgainstProject(project, locales);
  if (isErr(localeValidation)) {
    throw new Error(localeValidation.error.code);
  }

  const pages = await listCollectedCanvaPageFiles({
    organizationId: input.organizationId,
    projectId: project.id,
    designId: input.designId,
  });
  if (pages.length === 0) {
    throw new Error("canva_design_not_collected");
  }

  const jobIds = await createJobsForCollectedPages({
    organizationId: input.organizationId,
    apiKeyId: input.apiKeyId,
    canvaConnectionId: input.canvaConnectionId,
    projectId: project.id,
    designId: input.designId,
    locales,
    pages,
    generate: true,
    jobQueue: input.jobQueue,
    createdByUserId: apiKey.createdByUserId,
  });

  return {
    locale: locales.targetLocales[0] ?? input.targetLocales[0] ?? "",
    projectId: project.id,
    jobIds,
  };
}

export async function listCanvaDesignLocaleStatuses(input: {
  organizationId: string;
  apiKeyId: string;
  canvaConnectionId: string;
  projectId: string;
  designId: string;
}): Promise<{ locales: CanvaLocaleStatus[]; pages: CollectedCanvaPageFile[] }> {
  const { project } = await resolveCanvaWorkContext(input);
  const pages = await listCollectedCanvaPageFiles({
    organizationId: input.organizationId,
    projectId: project.id,
    designId: input.designId,
  });
  const targetLocales = project.targetLocales ?? [];
  const jobs = await listCanvaDesignJobs({
    organizationId: input.organizationId,
    canvaConnectionId: input.canvaConnectionId,
    projectId: project.id,
    apiKeyId: input.apiKeyId,
    designId: input.designId,
  });

  const sourceLocale = project.sourceLocale?.trim() || "en";
  const sourceByPage = new Map<number, Record<string, string>>();
  const [approvalCounts] = await Promise.all([
    loadCanvaApprovedSegmentCounts({
      organizationId: input.organizationId,
      projectId: project.id,
      sourcePaths: pages.map((page) => page.sourcePath),
    }),
    Promise.all(
      pages.map(async (page) => {
        try {
          const stored = await getStoredFileContent({
            organizationId: input.organizationId,
            projectId: project.id,
            fileId: page.sourceFileId,
          });
          sourceByPage.set(page.pageIndex, parseStoredTranslationFile(stored.content));
        } catch {
          sourceByPage.set(page.pageIndex, {});
        }
      }),
    ),
  ]);

  const locales: CanvaLocaleStatus[] = [
    buildCanvaSourceLocaleStatus({
      locale: sourceLocale,
      pages,
      sourceByPage,
      sourceLocale,
    }),
  ];
  for (const locale of targetLocales) {
    if (locale === sourceLocale) {
      continue;
    }
    const localePages: CanvaLocalePageStatus[] = [];
    for (const page of pages) {
      const sourceFile = sourceByPage.get(page.pageIndex) ?? {};
      const wordCount =
        page.wordCount > 0 ? page.wordCount : countTranslationFileWords(sourceFile, sourceLocale);
      const job = jobs.find(
        (candidate) =>
          readMetadataNumber(candidate.inputPayload, "canvaPageIndex") === page.pageIndex &&
          readJobTargetLocales(candidate.inputPayload).includes(locale),
      );
      const status = job ? publicCanvaJobStatus(job.status) : "idle";
      let translated = 0;
      let translatedWords = 0;
      if (job && status !== "idle" && canvaJobHasPullableTranslations(status)) {
        const outputFiles = (publicJobOutputFiles(job) ?? []).filter(
          (file) => file.locale === locale,
        );
        if (outputFiles.length > 0 && job.projectId) {
          const loaded = await loadTranslationsByLocale({
            organizationId: input.organizationId,
            projectId: job.projectId,
            outputFiles,
          });
          const translations = loaded[locale] ?? {};
          translated = countTranslatedKeys(translations, page.segmentCount);
          translatedWords = countTranslatedSourceWords(sourceFile, translations, sourceLocale);
        }
      }
      const approvedFromStore = approvalCounts.approvedByLocaleAndPath.get(
        `${locale}\0${page.sourcePath}`,
      );
      localePages.push({
        pageIndex: page.pageIndex,
        sourcePath: page.sourcePath,
        jobId: job?.id ?? null,
        status,
        translated,
        total: page.segmentCount,
        translatedWords,
        wordCount,
        approved: approvalCounts.hasIngestedKeys
          ? (approvedFromStore ?? 0)
          : fallbackApprovedSegmentCount(status, translated, page.segmentCount),
      });
    }

    const translated = localePages.reduce((sum, page) => sum + page.translated, 0);
    const total = localePages.reduce((sum, page) => sum + page.total, 0);
    const translatedWords = localePages.reduce((sum, page) => sum + page.translatedWords, 0);
    const wordCount = localePages.reduce((sum, page) => sum + page.wordCount, 0);
    const approvedFromStore = approvalCounts.approvedByLocale.get(locale);
    const approved = approvalCounts.hasIngestedKeys
      ? (approvedFromStore ?? 0)
      : localePages.reduce((sum, page) => sum + page.approved, 0);
    const rolled = rollupLocaleStatus(localePages);
    const progressTotal = wordCount > 0 ? wordCount : total;
    const progressDone = wordCount > 0 ? translatedWords : translated;
    locales.push({
      locale,
      isSource: false,
      ...rolled,
      translated,
      total,
      translatedWords,
      wordCount,
      percent: progressTotal === 0 ? 0 : Math.round((progressDone / progressTotal) * 100),
      approved,
      approvedPercent: canvaApprovalPercent(approved, total),
      pages: localePages,
    });
  }

  return { locales, pages };
}

function readMetadataNumber(inputPayload: unknown, key: string): number | null {
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
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

async function listCanvaDesignJobs(input: {
  organizationId: string;
  canvaConnectionId: string;
  projectId: string;
  apiKeyId: string;
  designId: string;
}): Promise<CanvaJobSnapshot[]> {
  const rows = await db
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
    .orderBy(desc(schema.jobs.createdAt));

  return rows.filter((job) => {
    if (!canvaJobMatchesDesign(job.inputPayload, input.designId) || !job.projectId) {
      return false;
    }
    const storedConnectionId = readCanvaConnectionIdFromJobInput(job.inputPayload);
    return !storedConnectionId || storedConnectionId === input.canvaConnectionId;
  });
}

export async function pullCanvaLocalePageTranslations(input: {
  organizationId: string;
  canvaConnectionId: string;
  projectId: string;
  apiKeyId: string;
  designId: string;
  locale: string;
  pageIndex?: number;
}): Promise<{
  locale: string;
  projectId: string;
  pages: Array<{
    pageIndex: number;
    sourcePath: string;
    jobId: string;
    status: CanvaJobStatusName;
    translations: Record<string, string>;
  }>;
}> {
  const statuses = await listCanvaDesignLocaleStatuses(input);
  const localeStatus = statuses.locales.find((entry) => entry.locale === input.locale);
  if (!localeStatus) {
    throw new Error("job_target_locale_not_in_project");
  }

  const pagesToPull = localeStatus.pages.filter(
    (page) => input.pageIndex == null || page.pageIndex === input.pageIndex,
  );
  const editorTranslationsByPath = localeStatus.isSource
    ? new Map<string, Record<string, string>>()
    : await loadCanvaEditorTranslationsBySourcePath({
        organizationId: input.organizationId,
        projectId: input.projectId,
        locale: input.locale,
        sourcePaths: pagesToPull.map((page) => page.sourcePath),
      });

  const pages = [];
  for (const page of localeStatus.pages) {
    if (input.pageIndex != null && page.pageIndex !== input.pageIndex) {
      continue;
    }
    if (localeStatus.isSource) {
      const collected = statuses.pages.find((entry) => entry.pageIndex === page.pageIndex);
      if (!collected) {
        continue;
      }
      try {
        const stored = await getStoredFileContent({
          organizationId: input.organizationId,
          projectId: input.projectId,
          fileId: collected.sourceFileId,
        });
        pages.push({
          pageIndex: page.pageIndex,
          sourcePath: page.sourcePath,
          jobId: page.jobId ?? "",
          status: "succeeded" as const,
          translations: normalizePageScopedTranslationKeys(
            parseStoredTranslationFile(stored.content),
            page.pageIndex,
          ),
        });
      } catch {
        continue;
      }
      continue;
    }
    if (!page.jobId || (page.status !== "succeeded" && page.status !== "waiting_for_review")) {
      continue;
    }
    const job = await getTranslationJobSnapshot({
      jobId: page.jobId,
      organizationId: input.organizationId,
    });
    const outputFiles = (publicJobOutputFiles(job) ?? []).filter(
      (file) => file.locale === input.locale,
    );
    const loaded =
      outputFiles.length > 0 && job.projectId
        ? await loadTranslationsByLocale({
            organizationId: input.organizationId,
            projectId: job.projectId,
            outputFiles,
          })
        : {};
    const outputFile = loaded[input.locale] ?? {};
    const editorSegments = editorTranslationsByPath.get(page.sourcePath) ?? {};
    pages.push({
      pageIndex: page.pageIndex,
      sourcePath: page.sourcePath,
      jobId: page.jobId,
      status: page.status,
      translations: normalizePageScopedTranslationKeys(
        mergeEditorTranslationsOverOutputFile(outputFile, editorSegments),
        page.pageIndex,
      ),
    });
  }

  return {
    locale: input.locale,
    projectId: input.projectId,
    pages,
  };
}

export async function startCanvaLocalization(input: {
  organizationId: string;
  apiKeyId: string;
  canvaConnectionId: string;
  projectId: string;
  sourceLocale?: string;
  targetLocales?: string[];
  designId: string;
  designTitle?: string;
  segments: CanvaDesignSegment[];
  generate?: boolean;
  jobQueue?: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<StartCanvaLocalizationResult> {
  const generate = input.generate ?? Boolean(input.jobQueue);
  const { apiKey, project } = await resolveCanvaWorkContext(input);
  const locales = resolveCanvaJobLocales({
    project,
    requestedTargetLocales: input.targetLocales,
  });
  const localeValidation = validateJobLocalesAgainstProject(project, locales);
  if (isErr(localeValidation)) {
    throw new Error(localeValidation.error.code);
  }

  const collected = await collectCanvaDesign({
    organizationId: input.organizationId,
    apiKeyId: input.apiKeyId,
    canvaConnectionId: input.canvaConnectionId,
    projectId: input.projectId,
    designId: input.designId,
    designTitle: input.designTitle,
    segments: input.segments,
    fileStorageAdapter: input.fileStorageAdapter,
  });

  const jobIds = await createJobsForCollectedPages({
    organizationId: input.organizationId,
    apiKeyId: input.apiKeyId,
    canvaConnectionId: input.canvaConnectionId,
    projectId: project.id,
    designId: input.designId,
    locales,
    pages: collected.pages,
    generate,
    jobQueue: input.jobQueue,
    createdByUserId: apiKey.createdByUserId,
  });

  const firstPage = collected.pages[0];
  const firstJobId = jobIds[0];
  if (!firstPage || !firstJobId) {
    throw new Error("canva_no_text_segments");
  }

  return {
    jobId: firstJobId,
    generated: generate,
    projectId: project.id,
    sourcePath: firstPage.sourcePath,
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
