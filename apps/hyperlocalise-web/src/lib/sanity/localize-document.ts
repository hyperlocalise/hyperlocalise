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

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { buildAccessibleJobsWhere, buildAccessibleProjectsWhere } from "@/api/auth/team-access";
import { db, schema } from "@/lib/database/client";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import {
  createRepositorySourceFileVersion,
  createStoredFile,
  getStoredFileContent,
  normalizeSourcePath,
} from "@/lib/file-storage/records";
import { sanityProjectLocalesMatch, isProjectSourceLocale } from "@/lib/sanity/sanity-locale-match";
import { canonicalizeLocale } from "@/lib/i18n/locales";
import { validateJobLocalesAgainstProject } from "@/lib/i18n/project-job-locales";
import { isErr } from "@/lib/primitives/result/results";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import {
  isSourceFileIngestInProgress,
  type SourceFileIngestState,
} from "@/lib/projects/files/source-file-ingest-state";
import { getJobInputPayloadString } from "@/lib/projects/jobs/native-job-source-file-display";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import { parseIntegrationJsonFileExtracted } from "@/lib/sanity/integration-json-job-output";
import { omitMultiWordSameAsSourceTranslations } from "@/lib/sanity/omit-multi-word-same-as-source";
import { createLogger } from "@/lib/log";
import { importApprovedProjectTranslationsFromEntries } from "@/lib/projects/translations/project-translation-service";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

const sanityLocalizeLogger = createLogger("sanity-localize");

import {
  buildSanityDocumentFileName,
  buildSanityDocumentSourcePath,
  isSanityStampSegmentKey,
  parseSanityTranslationFile,
  propagateSanityTranslationsBySharedSource,
  segmentsToTranslationFile,
} from "./segment-file";
import type {
  CollectedSanityDocument,
  CollectSanityDocumentResult,
  SanityCurrentJobResult,
  SanityDocumentSegment,
  SanityJobStatusName,
  SanityLocaleDocumentStatus,
  SanityLocaleProgress,
  SanityLocaleStatusesResult,
  SanityLocalizationStatus,
  SanityDocumentJob,
  SanitySourcePullEntry,
  SanitySourcePullPage,
  StartSanityLocalizationResult,
} from "./types";

type PublicJobOutputFile = {
  fileId: string;
  locale: string;
  filename: string;
};

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Parses file-result outcome payloads for Sanity pull/status responses. */
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
  sourceByKey?: Record<string, string>;
}) {
  const translationsByLocale: Record<string, Record<string, string>> = {};
  const integrationSource =
    input.sourceByKey && Object.keys(input.sourceByKey).some(isSanityStampSegmentKey);

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

    const stampOnly = parseSanityTranslationFile(parsed);
    const entries =
      integrationSource && input.sourceByKey
        ? parseIntegrationJsonFileExtracted(parsed, input.sourceByKey)
        : stampOnly;
    translationsByLocale[outputFile.locale] = entries;
  }

  return translationsByLocale;
}

/** Job output fills missing editor rows; Content Editor text still wins
 * unless the editor row is only the source fallback. */
export function mergeSanityPullTranslations(
  editorTranslations: Record<string, string>,
  jobTranslations: Record<string, string>,
  sourceByKey: Record<string, string> = {},
): Record<string, string> {
  const merged: Record<string, string> = {};
  const jobEntries =
    Object.keys(sourceByKey).length > 0
      ? omitMultiWordSameAsSourceTranslations(sourceByKey, jobTranslations)
      : jobTranslations;
  for (const [key, value] of Object.entries(jobEntries)) {
    if (value.trim().length > 0) {
      merged[key] = value;
    }
  }
  for (const [key, value] of Object.entries(editorTranslations)) {
    const editor = value.trim();
    if (!editor) {
      continue;
    }
    const source = (sourceByKey[key] ?? "").trim();
    const job = (merged[key] ?? "").trim();
    if (source && editor === source && job && job !== source) {
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function localeKey(locale: string): string {
  return locale.trim().toLowerCase();
}

function sliceSanityDocumentJobForLocale(
  job: SanityDocumentJob,
  locale: string,
): SanityDocumentJob {
  const picked = pickTranslationsForLocale(job.translationsByLocale, locale);
  if (!picked) {
    return job;
  }
  return {
    ...job,
    translationsByLocale: { [locale.trim()]: picked },
    targetLocales: [locale.trim()],
  };
}

export function pickTranslationsForLocale(
  translationsByLocale: Record<string, Record<string, string>>,
  locale: string,
): Record<string, string> | undefined {
  const trimmed = locale.trim();
  if (!trimmed) {
    return undefined;
  }
  if (translationsByLocale[trimmed]) {
    return translationsByLocale[trimmed];
  }
  const canonical = canonicalizeLocale(trimmed);
  if (canonical && translationsByLocale[canonical]) {
    return translationsByLocale[canonical];
  }
  const targetKey = localeKey(trimmed);
  const match = Object.entries(translationsByLocale).find(
    ([entryLocale]) => localeKey(entryLocale) === targetKey,
  );
  if (match && countNonEmptyTranslations(match[1])) {
    return match[1];
  }

  return undefined;
}

function countNonEmptyTranslations(translations: Record<string, string>): number {
  return Object.values(translations).filter((value) => value.trim().length > 0).length;
}

function sanityEditorTranslationLookupKey(locale: string, sourcePath: string) {
  return `${locale}\0${sourcePath}`;
}

async function loadSanityEditorTranslationsBySourcePaths(input: {
  organizationId: string;
  projectId: string;
  locales: string[];
  sourcePaths: string[];
}): Promise<{
  texts: Map<string, Record<string, string>>;
  progressRows: Map<string, Array<{ text: string; status: string }>>;
}> {
  const locales = [...new Set(input.locales.map((locale) => locale.trim()).filter(Boolean))];
  const sourcePaths = [...new Set(input.sourcePaths.filter((path) => path.trim().length > 0))];
  const texts = new Map<string, Record<string, string>>();
  const progressRows = new Map<string, Array<{ text: string; status: string }>>();
  if (locales.length === 0 || sourcePaths.length === 0) {
    return { texts, progressRows };
  }

  const rows = await db
    .select({
      key: schema.projectTranslationKeys.key,
      text: schema.projectTranslations.text,
      status: schema.projectTranslations.status,
      locale: schema.projectTranslations.targetLocale,
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
        inArray(schema.projectTranslations.targetLocale, locales),
        inArray(schema.repositorySourceFiles.sourcePath, sourcePaths),
      ),
    );

  for (const row of rows) {
    if (!isSanityStampSegmentKey(row.key)) {
      continue;
    }
    const lookupKey = sanityEditorTranslationLookupKey(row.locale, row.sourcePath);
    const progress = progressRows.get(lookupKey) ?? [];
    progress.push({ text: row.text, status: row.status });
    progressRows.set(lookupKey, progress);
    if (row.text.trim().length === 0) {
      continue;
    }
    let segments = texts.get(lookupKey);
    if (!segments) {
      segments = {};
      texts.set(lookupKey, segments);
    }
    segments[row.key] = row.text;
  }
  return { texts, progressRows };
}

async function loadSanityEditorTranslationsBySourcePath(input: {
  organizationId: string;
  projectId: string;
  locale: string;
  sourcePath: string;
}): Promise<Record<string, string>> {
  const batched = await loadSanityEditorTranslationsBySourcePaths({
    organizationId: input.organizationId,
    projectId: input.projectId,
    locales: [input.locale],
    sourcePaths: [input.sourcePath],
  });
  return batched.texts.get(sanityEditorTranslationLookupKey(input.locale, input.sourcePath)) ?? {};
}

async function mergeSanityTranslationsWithEditor(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  jobTranslations: Record<string, Record<string, string>>;
  targetLocales: string[];
  sourceByKey?: Record<string, string>;
}): Promise<Record<string, Record<string, string>>> {
  const localeSet = new Set<string>([
    ...Object.keys(input.jobTranslations),
    ...input.targetLocales.map((locale) => locale.trim()).filter(Boolean),
  ]);
  const mergedByLocale: Record<string, Record<string, string>> = {};

  await Promise.all(
    [...localeSet].map(async (locale) => {
      const editor = await loadSanityEditorTranslationsBySourcePath({
        organizationId: input.organizationId,
        projectId: input.projectId,
        locale,
        sourcePath: input.sourcePath,
      });
      const jobForLocale = input.jobTranslations[locale] ?? {};
      let merged = mergeSanityPullTranslations(editor, jobForLocale, input.sourceByKey);
      if (input.sourceByKey && countNonEmptyTranslations(input.sourceByKey) > 0) {
        merged = propagateSanityTranslationsBySharedSource(input.sourceByKey, merged);
      }
      if (countNonEmptyTranslations(merged) > 0) {
        mergedByLocale[locale] = merged;
      }
    }),
  );

  return mergedByLocale;
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

/** True when a translation job was created by the Sanity plugin integration. */
export function isSanityIntegrationJob(inputPayload: unknown) {
  return readMetadataString(inputPayload, "integration") === "sanity-plugin";
}

/** True when job metadata points at this Sanity file and page. */
export function sanityJobMatchesPage(
  inputPayload: unknown,
  input: { sanityProjectId: string; documentId: string; dataset: string },
) {
  const dataset = readMetadataString(inputPayload, "sanityDataset");
  if (!dataset) {
    return false;
  }
  return (
    isSanityIntegrationJob(inputPayload) &&
    readMetadataString(inputPayload, "sanityProjectId") === input.sanityProjectId &&
    readMetadataString(inputPayload, "sanityDocumentId") === input.documentId &&
    dataset === input.dataset
  );
}

const FIGMA_JOB_STATUSES = new Set<SanityJobStatusName>([
  "queued",
  "running",
  "waiting_for_review",
  "succeeded",
  "failed",
  "cancelled",
]);

export function publicSanityJobStatus(status: string): SanityJobStatusName {
  if (FIGMA_JOB_STATUSES.has(status as SanityJobStatusName)) {
    return status as SanityJobStatusName;
  }
  return "queued";
}

export function sanityJobHasPullableTranslations(status: SanityJobStatusName) {
  return status === "succeeded" || status === "waiting_for_review";
}

export const FIGMA_SOURCE_INGEST_WAIT_TIMEOUT_MS = 20_000;
export const FIGMA_SOURCE_INGEST_WAIT_INTERVAL_MS = 500;

export function sanitySourceIngestIsSettled(state: string | null | undefined) {
  return state != null && !isSourceFileIngestInProgress(state as SourceFileIngestState);
}

async function loadSanitySourceIngestStates(input: {
  organizationId: string;
  projectId: string;
  sourcePaths: string[];
}): Promise<Array<string | null>> {
  if (input.sourcePaths.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      sourcePath: schema.repositorySourceFileVersions.sourcePath,
      ingestState: schema.repositorySourceFileVersions.ingestState,
    })
    .from(schema.repositorySourceFileVersions)
    .where(
      and(
        eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
        eq(schema.repositorySourceFileVersions.projectId, input.projectId),
        inArray(schema.repositorySourceFileVersions.sourcePath, input.sourcePaths),
      ),
    )
    .orderBy(desc(schema.repositorySourceFileVersions.createdAt));

  const latest = new Map<string, string>();
  for (const row of rows) {
    if (!latest.has(row.sourcePath)) {
      latest.set(row.sourcePath, row.ingestState);
    }
  }
  return input.sourcePaths.map((sourcePath) => latest.get(sourcePath) ?? null);
}

export async function waitForSanitySourceIngest(input: {
  organizationId: string;
  projectId: string;
  sourcePaths: string[];
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  loadStates?: () => Promise<Array<string | null>>;
}): Promise<boolean> {
  if (input.sourcePaths.length === 0) {
    return true;
  }

  const timeoutMs = input.timeoutMs ?? FIGMA_SOURCE_INGEST_WAIT_TIMEOUT_MS;
  const intervalMs = input.intervalMs ?? FIGMA_SOURCE_INGEST_WAIT_INTERVAL_MS;
  const now = input.now ?? Date.now;
  const sleep =
    input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const loadStates = input.loadStates ?? (() => loadSanitySourceIngestStates(input));
  const startedAt = now();

  while (true) {
    const states = await loadStates();
    if (
      states.length === input.sourcePaths.length &&
      states.every((state) => sanitySourceIngestIsSettled(state))
    ) {
      return true;
    }
    if (now() - startedAt >= timeoutMs) {
      return false;
    }
    await sleep(intervalMs);
  }
}

function readJobSourceLocale(inputPayload: unknown): string | null {
  if (!inputPayload || typeof inputPayload !== "object") {
    return null;
  }
  const value = (inputPayload as Record<string, unknown>).sourceLocale;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readJobTargetLocales(inputPayload: unknown): string[] {
  if (!inputPayload || typeof inputPayload !== "object") {
    return [];
  }
  const locales = (inputPayload as Record<string, unknown>).targetLocales;
  if (!Array.isArray(locales)) {
    return [];
  }
  return locales.filter((value): value is string => typeof value === "string" && value.length > 0);
}

type SanityJobSnapshot = {
  id: string;
  status: string;
  projectId: string | null;
  inputPayload: unknown;
  lastError: string | null;
  type: string | null;
  outcomeKind: string | null;
  outcomePayload: unknown;
};

function sanityJobSelectFields() {
  return {
    id: schema.jobs.id,
    status: schema.jobs.status,
    projectId: schema.jobs.projectId,
    inputPayload: schema.jobs.inputPayload,
    lastError: schema.jobs.lastError,
    type: schema.translationJobDetails.type,
    outcomeKind: schema.translationJobDetails.outcomeKind,
    outcomePayload: schema.jobs.outcomePayload,
  };
}

async function toSanityDocumentJob(input: {
  job: SanityJobSnapshot;
  organizationId: string;
}): Promise<SanityDocumentJob> {
  const projectId = input.job.projectId;
  if (!projectId) {
    throw new Error("translation_job_missing_project");
  }

  const status = publicSanityJobStatus(input.job.status);
  const sourcePath =
    readMetadataString(input.job.inputPayload, "sourcePath") ??
    normalizeSourcePath(
      buildSanityDocumentSourcePath({
        sanityProjectId: readMetadataString(input.job.inputPayload, "sanityProjectId") ?? "unknown",
        dataset: readMetadataString(input.job.inputPayload, "sanityDataset") ?? "production",
        documentType:
          readMetadataString(input.job.inputPayload, "sanityDocumentType") ?? "document",
        documentId: readMetadataString(input.job.inputPayload, "sanityDocumentId") ?? "unknown",
      }),
    );

  let translationsByLocale: Record<string, Record<string, string>> = {};
  const targetLocales = readJobTargetLocales(input.job.inputPayload);
  if (sanityJobHasPullableTranslations(status)) {
    const jobSourceLocale = readJobSourceLocale(input.job.inputPayload);
    const sourceFileId = getJobInputPayloadString(input.job.inputPayload, "sourceFileId");
    let sourceByKey: Record<string, string> = {};
    if (sourceFileId) {
      try {
        const { content } = await getStoredFileContent({
          organizationId: input.organizationId,
          projectId,
          fileId: sourceFileId,
        });
        const parsed = JSON.parse(content.toString("utf8")) as Record<string, unknown>;
        const sourceFile = parseSanityTranslationFile(parsed);
        for (const [key, value] of Object.entries(sourceFile)) {
          if (isSanityStampSegmentKey(key) && value.trim().length > 0) {
            sourceByKey[key] = value;
          }
        }
      } catch {
        sourceByKey = {};
      }
    }

    const outputFiles = publicJobOutputFiles(input.job) ?? [];
    const jobTranslations =
      outputFiles.length > 0
        ? await loadTranslationsByLocale({
            organizationId: input.organizationId,
            projectId,
            outputFiles,
            sourceByKey,
          })
        : {};
    translationsByLocale = await mergeSanityTranslationsWithEditor({
      organizationId: input.organizationId,
      projectId,
      sourcePath,
      jobTranslations,
      targetLocales,
      sourceByKey,
    });

    if (jobSourceLocale && countNonEmptyTranslations(sourceByKey) > 0) {
      const editorSource = await loadSanityEditorTranslationsBySourcePath({
        organizationId: input.organizationId,
        projectId,
        locale: jobSourceLocale,
        sourcePath,
      });
      const mergedSource = mergeSanityPullTranslations(editorSource, sourceByKey);
      if (countNonEmptyTranslations(mergedSource) > 0) {
        translationsByLocale[jobSourceLocale] = mergedSource;
      }
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

export async function getAccessibleSanityProject(auth: ApiAuthContext, projectId: string) {
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

function readStoredFileMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function countSanityTranslatedKeys(translations: Record<string, string>, total: number) {
  let translated = 0;
  for (const value of Object.values(translations)) {
    if (value.trim().length > 0) {
      translated += 1;
    }
  }
  return Math.min(translated, total);
}

export function tallySanityLocaleProgress(
  rows: ReadonlyArray<{ text?: string | null; status?: string | null }>,
  segmentCount: number,
): SanityLocaleProgress {
  let approvedCount = 0;
  let reviewCount = 0;
  for (const row of rows) {
    if (!row.text?.trim()) {
      continue;
    }
    if (row.status === "approved") {
      approvedCount += 1;
    } else {
      reviewCount += 1;
    }
  }
  const filled = approvedCount + reviewCount;
  const total = segmentCount > 0 ? segmentCount : filled;
  return {
    segmentCount: total,
    approvedCount: Math.min(approvedCount, total),
    reviewCount: Math.min(reviewCount, total),
  };
}

function emptyLocaleProgress(segmentCount = 0): SanityLocaleProgress {
  return { segmentCount, approvedCount: 0, reviewCount: 0 };
}

export async function collectSanityDocument(input: {
  auth: ApiAuthContext;
  apiKeyId: string;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  documentType: string;
  documentTitle?: string;
  segments: SanityDocumentSegment[];
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<CollectSanityDocumentResult> {
  const project = await getAccessibleSanityProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("sanity_project_not_found");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const sourcePath = buildSanityDocumentSourcePath({
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentType: input.documentType,
    documentTitle: input.documentTitle,
    documentId: input.documentId,
  });
  const translationFile = segmentsToTranslationFile(input.segments);
  const segmentCount = Object.keys(translationFile).length;
  if (segmentCount === 0) {
    throw new Error("sanity_no_text_segments");
  }

  const fileBody = JSON.stringify(translationFile, null, 2);
  const sourceHash = createHash("sha256").update(fileBody).digest("hex");
  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();
  const filename = buildSanityDocumentFileName({
    documentTitle: input.documentTitle,
    documentId: input.documentId,
  });

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
      uploadSurface: "sanity_plugin",
      integration: "sanity-plugin",
      sanityProjectId: input.sanityProjectId,
      sanityDataset: input.dataset,
      sanityDocumentType: input.documentType,
      sanityDocumentId: input.documentId,
      segmentCount,
    },
    adapter,
  });

  const version = await createRepositorySourceFileVersion({
    storedFile,
    sourcePath,
    sourceHash,
    uploadedByApiKeyId: input.apiKeyId,
    uploadedByUserId: input.auth.user.localUserId,
    uploadSurface: "sanity_plugin",
  });

  try {
    await enqueueSourceFileIngestAfterUpload({
      organizationId,
      projectId: project.id,
      storedFileId: storedFile.id,
      sourceFileVersionId: version.id,
      sourcePath,
      sourceHash,
    });
  } catch (error) {
    sanityLocalizeLogger.warn("sanity source ingest enqueue failed", {
      organizationId,
      projectId: project.id,
      storedFileId: storedFile.id,
      errorCode: error instanceof Error ? error.message : "unknown",
    });
  }

  return {
    projectId: project.id,
    sourceFileId: storedFile.id,
    sourcePath,
    segmentCount,
  };
}

export async function importSanityPluginTargetTranslations(input: {
  auth: ApiAuthContext;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  targetLocale: string;
  entries: Record<string, string>;
}): Promise<{ matched: number; imported: number; skipped: number }> {
  const project = await getAccessibleSanityProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("sanity_project_not_found");
  }

  if (isProjectSourceLocale(project.sourceLocale ?? "", input.targetLocale)) {
    throw new Error("invalid_job_target_locale");
  }

  const projectTargetLocale = (project.targetLocales ?? []).find((locale) =>
    sanityProjectLocalesMatch(locale, input.targetLocale),
  );
  if (!projectTargetLocale) {
    throw new Error("job_target_locale_not_in_project");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const pages = await listCollectedSanityDocuments({
    organizationId,
    projectId: project.id,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentIds: [input.documentId],
  });
  const collected = pages.find((page) => page.documentId === input.documentId);
  if (!collected) {
    throw new Error("sanity_document_not_collected");
  }

  return importApprovedProjectTranslationsFromEntries({
    organizationId,
    projectId: project.id,
    sourcePath: collected.sourcePath,
    targetLocale: projectTargetLocale,
    entries: input.entries,
    actorUserId: input.auth.user.localUserId,
  });
}

export async function listCollectedSanityDocuments(input: {
  organizationId: string;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentIds: string[];
}): Promise<CollectedSanityDocument[]> {
  const uniquePageIds = [
    ...new Set(input.documentIds.filter((documentId) => documentId.trim().length > 0)),
  ];
  if (uniquePageIds.length === 0) {
    return [];
  }

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
        sql`${schema.storedFiles.metadata}->>'integration' = 'sanity-plugin'`,
        sql`${schema.storedFiles.metadata}->>'sanityProjectId' = ${input.sanityProjectId}`,
        sql`${schema.storedFiles.metadata}->>'sanityDataset' = ${input.dataset}`,
        or(
          ...uniquePageIds.map(
            (documentId) =>
              sql`${schema.storedFiles.metadata}->>'sanityDocumentId' = ${documentId}`,
          ),
        ),
      ),
    )
    .orderBy(desc(schema.storedFiles.createdAt));

  const latestByPageId = new Map<string, CollectedSanityDocument>();
  for (const row of rows) {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const documentId = readStoredFileMetadataString(metadata, "sanityDocumentId");
    const sourcePath = readStoredFileMetadataString(metadata, "sourcePath");
    if (!documentId || !sourcePath || latestByPageId.has(documentId)) {
      continue;
    }
    const segmentCount =
      typeof metadata.segmentCount === "number" && Number.isFinite(metadata.segmentCount)
        ? metadata.segmentCount
        : 0;
    latestByPageId.set(documentId, {
      documentId,
      sourcePath,
      sourceFileId: row.id,
      segmentCount,
    });
  }

  return uniquePageIds
    .map((documentId) => latestByPageId.get(documentId))
    .filter((page): page is CollectedSanityDocument => page != null);
}

async function listSanityDatasetJobs(input: {
  auth: ApiAuthContext;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
}): Promise<SanityJobSnapshot[]> {
  const organizationId = input.auth.organization.localOrganizationId;
  const accessibleJobsWhere = await buildAccessibleJobsWhere(input.auth);
  const rows = await db
    .select(sanityJobSelectFields())
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(
      and(
        eq(schema.jobs.organizationId, organizationId),
        eq(schema.jobs.kind, "translation"),
        eq(schema.jobs.projectId, input.projectId),
        accessibleJobsWhere,
        sql`${schema.jobs.inputPayload}->'metadata'->>'integration' = 'sanity-plugin'`,
        sql`${schema.jobs.inputPayload}->'metadata'->>'sanityProjectId' = ${input.sanityProjectId}`,
        sql`${schema.jobs.inputPayload}->'metadata'->>'sanityDataset' = ${input.dataset}`,
      ),
    )
    .orderBy(desc(schema.jobs.createdAt));

  return rows.filter(
    (job) =>
      isSanityIntegrationJob(job.inputPayload) &&
      readMetadataString(job.inputPayload, "sanityProjectId") === input.sanityProjectId &&
      readMetadataString(job.inputPayload, "sanityDataset") === input.dataset,
  );
}

export async function listSanityDocumentLocaleStatuses(input: {
  auth: ApiAuthContext;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentIds: string[];
}): Promise<SanityLocaleStatusesResult> {
  const project = await getAccessibleSanityProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("sanity_project_not_found");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const documentIds = [
    ...new Set(input.documentIds.filter((documentId) => documentId.trim().length > 0)),
  ];
  const pages = await listCollectedSanityDocuments({
    organizationId,
    projectId: project.id,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentIds,
  });
  const collectedByPageId = new Map(pages.map((page) => [page.documentId, page]));
  const jobs = await listSanityDatasetJobs({
    auth: input.auth,
    projectId: project.id,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
  });

  const sourceLocale = project.sourceLocale?.trim() || "en";
  const targetLocales = project.targetLocales ?? [];

  const sourcePages: SanityLocaleDocumentStatus[] = documentIds.map((documentId) => {
    const collected = collectedByPageId.get(documentId);
    const segmentCount = collected?.segmentCount ?? 0;
    return {
      documentId,
      status: collected ? "succeeded" : "missing",
      segmentCount,
      approvedCount: collected ? segmentCount : 0,
      reviewCount: 0,
    };
  });

  const locales: SanityLocaleStatusesResult["locales"] = [
    {
      locale: sourceLocale,
      isSource: true,
      documents: sourcePages,
    },
  ];

  const pendingEditorLookups: Array<{
    locale: string;
    documentId: string;
    sourcePath: string;
    segmentCount: number;
    hasJob: boolean;
  }> = [];

  for (const locale of targetLocales) {
    const trimmed = locale.trim();
    if (!trimmed || trimmed === sourceLocale) {
      continue;
    }

    const localePages: SanityLocaleDocumentStatus[] = [];
    for (const documentId of documentIds) {
      const collected = collectedByPageId.get(documentId);
      if (!collected) {
        localePages.push({ documentId, status: "missing", ...emptyLocaleProgress() });
        continue;
      }

      const job = jobs.find(
        (candidate) =>
          sanityJobMatchesPage(candidate.inputPayload, {
            sanityProjectId: input.sanityProjectId,
            documentId,
            dataset: input.dataset,
          }) &&
          readJobTargetLocales(candidate.inputPayload).some((target) =>
            sanityProjectLocalesMatch(target, trimmed),
          ),
      );

      localePages.push({
        documentId,
        status: job ? publicSanityJobStatus(job.status) : "missing",
        ...emptyLocaleProgress(collected.segmentCount),
      });
      pendingEditorLookups.push({
        locale: trimmed,
        documentId,
        sourcePath: collected.sourcePath,
        segmentCount: collected.segmentCount,
        hasJob: Boolean(job),
      });
    }

    locales.push({
      locale: trimmed,
      isSource: false,
      documents: localePages,
    });
  }

  const editorByLocaleAndPath = await loadSanityEditorTranslationsBySourcePaths({
    organizationId,
    projectId: project.id,
    locales: pendingEditorLookups.map((entry) => entry.locale),
    sourcePaths: pendingEditorLookups.map((entry) => entry.sourcePath),
  });
  const localePagesByLocale = new Map(locales.map((entry) => [entry.locale, entry.documents]));
  for (const pending of pendingEditorLookups) {
    const lookupKey = sanityEditorTranslationLookupKey(pending.locale, pending.sourcePath);
    const page = localePagesByLocale
      .get(pending.locale)
      ?.find((entry) => entry.documentId === pending.documentId);
    if (!page) {
      continue;
    }
    const progress = tallySanityLocaleProgress(
      editorByLocaleAndPath.progressRows.get(lookupKey) ?? [],
      pending.segmentCount,
    );
    page.segmentCount = progress.segmentCount;
    page.approvedCount = progress.approvedCount;
    page.reviewCount = progress.reviewCount;
    if (pending.hasJob) {
      continue;
    }
    const editorSegments = editorByLocaleAndPath.texts.get(lookupKey) ?? {};
    if (countSanityTranslatedKeys(editorSegments, pending.segmentCount) === 0) {
      continue;
    }
    page.status = "waiting_for_review";
  }

  return { locales, documents: pages };
}

export async function startSanityLocalization(input: {
  auth: ApiAuthContext;
  apiKeyId: string;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  documentType: string;
  documentTitle?: string;
  sourceLocale: string;
  targetLocales: string[];
  segments: SanityDocumentSegment[];
  generate: boolean;
  jobQueue: JobQueue<TranslationJobEventData>;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<StartSanityLocalizationResult> {
  const project = await getAccessibleSanityProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("sanity_project_not_found");
  }

  const localeValidation = validateJobLocalesAgainstProject(project, {
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
  });
  if (isErr(localeValidation)) {
    throw new Error(localeValidation.error.code);
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const collected = await collectSanityDocument({
    auth: input.auth,
    apiKeyId: input.apiKeyId,
    projectId: project.id,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentId: input.documentId,
    documentType: input.documentType,
    documentTitle: input.documentTitle,
    segments: input.segments,
    fileStorageAdapter: input.fileStorageAdapter,
  });

  const created = await createFileTranslationJob({
    organizationId,
    projectId: project.id,
    createdByUserId: input.auth.user.localUserId,
    ownerUserId: input.auth.user.localUserId,
    sourceFileId: collected.sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    metadata: {
      integration: "sanity-plugin",
      sanityProjectId: input.sanityProjectId,
      sanityDataset: input.dataset,
      sanityDocumentType: input.documentType,
      sanityDocumentId: input.documentId,
      sourcePath: collected.sourcePath,
    },
  });
  if (!created.ok) {
    throw new Error(created.code);
  }

  if (input.generate) {
    const ingestReady = await waitForSanitySourceIngest({
      organizationId,
      projectId: project.id,
      sourcePaths: [collected.sourcePath],
    });
    if (!ingestReady) {
      throw new Error("sanity_source_ingest_timeout");
    }
    const generated = await enqueueExistingFileTranslationJob({
      organizationId,
      jobId: created.jobId,
      jobQueue: input.jobQueue,
    });
    if (!generated.ok) {
      throw new Error(generated.code);
    }
  }

  return {
    jobId: created.jobId,
    generated: input.generate,
    projectId: project.id,
    sourcePath: collected.sourcePath,
  };
}

export async function generateSanityLocalization(input: {
  auth: ApiAuthContext;
  jobId: string;
  jobQueue: JobQueue<TranslationJobEventData>;
}): Promise<{ jobId: string }> {
  const organizationId = input.auth.organization.localOrganizationId;
  const job = await getSanityTranslationJobSnapshot({
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

export async function generateSanityLocaleJobs(input: {
  auth: ApiAuthContext;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  documentType: string;
  documentTitle?: string;
  sourceLocale?: string;
  targetLocales: string[];
  jobQueue: JobQueue<TranslationJobEventData>;
}): Promise<StartSanityLocalizationResult> {
  const project = await getAccessibleSanityProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("sanity_project_not_found");
  }

  const sourceLocale = input.sourceLocale?.trim() || project.sourceLocale?.trim() || "";
  const localeValidation = validateJobLocalesAgainstProject(project, {
    sourceLocale,
    targetLocales: input.targetLocales,
  });
  if (isErr(localeValidation)) {
    throw new Error(localeValidation.error.code);
  }

  const collected = await findLatestSanityCollectedPage({
    auth: input.auth,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentId: input.documentId,
    projectId: project.id,
  });
  if (!collected) {
    throw new Error("sanity_document_not_collected");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const ingestReady = await waitForSanitySourceIngest({
    organizationId,
    projectId: project.id,
    sourcePaths: [collected.sourcePath],
  });
  if (!ingestReady) {
    throw new Error("sanity_source_ingest_timeout");
  }

  const created = await createFileTranslationJob({
    organizationId,
    projectId: project.id,
    createdByUserId: input.auth.user.localUserId,
    ownerUserId: input.auth.user.localUserId,
    sourceFileId: collected.sourceFileId,
    sourceLocale,
    targetLocales: input.targetLocales,
    metadata: {
      integration: "sanity-plugin",
      sanityProjectId: input.sanityProjectId,
      sanityDataset: input.dataset,
      sanityDocumentId: input.documentId,
      sourcePath: collected.sourcePath,
    },
  });
  if (!created.ok) {
    throw new Error(created.code);
  }

  const generated = await enqueueExistingFileTranslationJob({
    organizationId,
    jobId: created.jobId,
    jobQueue: input.jobQueue,
  });
  if (!generated.ok) {
    throw new Error(generated.code);
  }

  return {
    jobId: created.jobId,
    generated: true,
    projectId: project.id,
    sourcePath: collected.sourcePath,
  };
}

async function findLatestSanityCollectedPage(input: {
  auth: ApiAuthContext;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  projectId: string;
}): Promise<{ sourceFileId: string; sourcePath: string } | null> {
  const organizationId = input.auth.organization.localOrganizationId;
  const pages = await listCollectedSanityDocuments({
    organizationId,
    projectId: input.projectId,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentIds: [input.documentId],
  });
  const page = pages[0];
  if (!page) {
    return null;
  }
  return { sourceFileId: page.sourceFileId, sourcePath: page.sourcePath };
}

async function getSanityTranslationJobSnapshot(input: {
  jobId: string;
  organizationId: string;
  auth: ApiAuthContext;
}) {
  const accessibleJobsWhere = await buildAccessibleJobsWhere(input.auth);
  const [job] = await db
    .select(sanityJobSelectFields())
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

  if (!job || !isSanityIntegrationJob(job.inputPayload)) {
    throw new Error("translation_job_not_found");
  }

  return job;
}

export async function getSanityLocalizationStatus(input: {
  auth: ApiAuthContext;
  jobId: string;
}): Promise<SanityLocalizationStatus> {
  const job = await getSanityTranslationJobSnapshot({
    jobId: input.jobId,
    organizationId: input.auth.organization.localOrganizationId,
    auth: input.auth,
  });

  return toSanityDocumentJob({
    job,
    organizationId: input.auth.organization.localOrganizationId,
  });
}

async function findLatestSanityDocumentJob(input: {
  auth: ApiAuthContext;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  projectId?: string;
}): Promise<SanityJobSnapshot | null> {
  const organizationId = input.auth.organization.localOrganizationId;
  const accessibleJobsWhere = await buildAccessibleJobsWhere(input.auth);
  const conditions = [
    eq(schema.jobs.organizationId, organizationId),
    eq(schema.jobs.kind, "translation"),
    accessibleJobsWhere,
    sql`${schema.jobs.inputPayload}->'metadata'->>'integration' = 'sanity-plugin'`,
    sql`${schema.jobs.inputPayload}->'metadata'->>'sanityProjectId' = ${input.sanityProjectId}`,
    sql`${schema.jobs.inputPayload}->'metadata'->>'sanityDataset' = ${input.dataset}`,
    sql`${schema.jobs.inputPayload}->'metadata'->>'sanityDocumentId' = ${input.documentId}`,
  ];

  if (input.projectId) {
    conditions.push(eq(schema.jobs.projectId, input.projectId));
  }

  const [job] = await db
    .select(sanityJobSelectFields())
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(and(...conditions))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);

  if (!job || !sanityJobMatchesPage(job.inputPayload, input) || !job.projectId) {
    return null;
  }

  return job;
}

export async function getCurrentSanityDocumentJob(input: {
  auth: ApiAuthContext;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  documentType: string;
  projectId?: string;
}): Promise<SanityCurrentJobResult> {
  if (input.projectId) {
    const project = await getAccessibleSanityProject(input.auth, input.projectId);
    if (!project) {
      throw new Error("sanity_project_not_found");
    }
  }

  const job = await findLatestSanityDocumentJob(input);
  if (!job) {
    return { job: null };
  }

  return {
    job: await toSanityDocumentJob({
      job,
      organizationId: input.auth.organization.localOrganizationId,
    }),
  };
}

async function loadSanityKnownTextsBySourcePath(input: {
  organizationId: string;
  projectId: string;
  sourcePaths: string[];
}): Promise<Map<string, string[]>> {
  const byKey = new Map<string, string[]>();
  if (input.sourcePaths.length === 0) {
    return byKey;
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
        inArray(schema.repositorySourceFiles.sourcePath, input.sourcePaths),
      ),
    );

  for (const row of rows) {
    if (row.text.trim().length === 0 || !row.sourcePath || !isSanityStampSegmentKey(row.key)) {
      continue;
    }
    const texts = byKey.get(row.key) ?? [];
    if (!texts.includes(row.text)) {
      texts.push(row.text);
    }
    byKey.set(row.key, texts);
  }

  return byKey;
}

export function buildSanitySourcePullEntries(input: {
  sourceFile: Record<string, string>;
  knownTextsByKey: Map<string, string[]>;
}): SanitySourcePullEntry[] {
  const entries: SanitySourcePullEntry[] = [];
  for (const [key, sourceRaw] of Object.entries(input.sourceFile)) {
    if (!isSanityStampSegmentKey(key)) {
      continue;
    }
    const source = sourceRaw.trim();
    if (!source) {
      continue;
    }
    const knownTexts = (input.knownTextsByKey.get(key) ?? []).filter(
      (text) => text.trim().length > 0 && text.trim() !== source,
    );
    entries.push({ key, source, knownTexts });
  }
  return entries;
}

export async function pullSanitySourcePageForUpload(input: {
  auth: ApiAuthContext;
  projectId: string;
  sanityProjectId: string;
  dataset?: string;
  documentType?: string;
  documentId: string;
}): Promise<SanitySourcePullPage> {
  const project = await getAccessibleSanityProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("sanity_project_not_found");
  }
  const projectSourceLocale = project.sourceLocale?.trim();
  if (!projectSourceLocale) {
    throw new Error("sanity_project_source_locale_missing");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const sourcePathDefault = buildSanityDocumentSourcePath({
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset ?? "production",
    documentType: input.documentType ?? "document",
    documentId: input.documentId,
  });

  const dataset = input.dataset?.trim() || "production";
  const collected = await findLatestSanityCollectedPage({
    auth: input.auth,
    sanityProjectId: input.sanityProjectId,
    dataset,
    documentId: input.documentId,
    projectId: project.id,
  });

  if (!collected) {
    return {
      locale: projectSourceLocale,
      sourcePath: sourcePathDefault,
      needsReupload: true,
      entries: [],
    };
  }

  const sourcePath = collected.sourcePath;
  const sourceFileId = collected.sourceFileId;

  let sourceFile: Record<string, string> = {};
  try {
    const { content } = await getStoredFileContent({
      organizationId,
      projectId: project.id,
      fileId: sourceFileId,
    });
    const parsed = JSON.parse(content.toString("utf8")) as Record<string, unknown>;
    sourceFile = parseSanityTranslationFile(parsed);
  } catch {
    return {
      locale: projectSourceLocale,
      sourcePath,
      needsReupload: true,
      entries: [],
    };
  }

  const knownTextsByKey = await loadSanityKnownTextsBySourcePath({
    organizationId,
    projectId: project.id,
    sourcePaths: [sourcePath],
  });
  const entries = buildSanitySourcePullEntries({ sourceFile, knownTextsByKey });

  return {
    locale: projectSourceLocale,
    sourcePath,
    needsReupload: entries.length === 0,
    entries,
  };
}

export async function pullSanityDocumentLocaleContent(input: {
  auth: ApiAuthContext;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentType?: string;
  documentId: string;
  locale?: string;
}): Promise<
  | { kind: "source"; sourcePage: SanitySourcePullPage }
  | { kind: "job"; translations: { jobId: null; status: "not_found" } | SanityDocumentJob }
> {
  const project = await getAccessibleSanityProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("sanity_project_not_found");
  }
  const projectSourceLocale = project.sourceLocale?.trim();
  if (!projectSourceLocale) {
    throw new Error("sanity_project_source_locale_missing");
  }

  const requestedLocale = input.locale?.trim();
  if (requestedLocale && isProjectSourceLocale(projectSourceLocale, requestedLocale)) {
    return {
      kind: "source",
      sourcePage: await pullSanitySourcePageForUpload(input),
    };
  }

  return {
    kind: "job",
    translations: await pullSanityTranslationsForPage(input),
  };
}

function readJobTargetLocalesIncludes(inputPayload: unknown, locale: string): boolean {
  return readJobTargetLocales(inputPayload).some((target) =>
    sanityProjectLocalesMatch(target, locale),
  );
}

async function findLatestSanityDocumentJobForLocale(input: {
  auth: ApiAuthContext;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  projectId: string;
  locale: string;
}): Promise<SanityJobSnapshot | null> {
  const jobs = await listSanityDatasetJobs({
    auth: input.auth,
    projectId: input.projectId,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
  });
  return (
    jobs.find(
      (job) =>
        sanityJobMatchesPage(job.inputPayload, {
          sanityProjectId: input.sanityProjectId,
          documentId: input.documentId,
          dataset: input.dataset,
        }) && readJobTargetLocalesIncludes(job.inputPayload, input.locale),
    ) ?? null
  );
}

export async function pullSanityTranslationsForPage(input: {
  auth: ApiAuthContext;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  locale?: string;
}): Promise<{ jobId: null; status: "not_found" } | SanityDocumentJob> {
  const project = await getAccessibleSanityProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("sanity_project_not_found");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const requestedLocale = input.locale?.trim();

  if (!requestedLocale) {
    const job = await findLatestSanityDocumentJob({
      auth: input.auth,
      sanityProjectId: input.sanityProjectId,
      dataset: input.dataset,
      documentId: input.documentId,
      projectId: project.id,
    });
    if (!job) {
      return { jobId: null, status: "not_found" };
    }
    return toSanityDocumentJob({ job, organizationId });
  }

  const job = await findLatestSanityDocumentJobForLocale({
    auth: input.auth,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentId: input.documentId,
    projectId: project.id,
    locale: requestedLocale,
  });
  if (job) {
    const pageJob = await toSanityDocumentJob({ job, organizationId });
    if (pickTranslationsForLocale(pageJob.translationsByLocale, requestedLocale)) {
      return sliceSanityDocumentJobForLocale(pageJob, requestedLocale);
    }
  }

  const collected = await findLatestSanityCollectedPage({
    auth: input.auth,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentId: input.documentId,
    projectId: project.id,
  });
  if (!collected) {
    return { jobId: null, status: "not_found" };
  }

  let sourceByKey: Record<string, string> = {};
  try {
    const { content } = await getStoredFileContent({
      organizationId,
      projectId: project.id,
      fileId: collected.sourceFileId,
    });
    const parsed = JSON.parse(content.toString("utf8")) as Record<string, unknown>;
    const sourceFile = parseSanityTranslationFile(parsed);
    for (const [key, value] of Object.entries(sourceFile)) {
      if (isSanityStampSegmentKey(key) && value.trim().length > 0) {
        sourceByKey[key] = value;
      }
    }
  } catch {
    return { jobId: null, status: "not_found" };
  }

  const editor = await loadSanityEditorTranslationsBySourcePath({
    organizationId,
    projectId: project.id,
    locale: requestedLocale,
    sourcePath: collected.sourcePath,
  });
  const merged = propagateSanityTranslationsBySharedSource(
    sourceByKey,
    mergeSanityPullTranslations(editor, {}, sourceByKey),
  );
  if (countNonEmptyTranslations(merged) === 0) {
    return { jobId: null, status: "not_found" };
  }

  return {
    jobId: job?.id ?? "",
    status: job ? publicSanityJobStatus(job.status) : "waiting_for_review",
    projectId: project.id,
    sourcePath: collected.sourcePath,
    targetLocales: job ? readJobTargetLocales(job.inputPayload) : [requestedLocale],
    lastError: job?.lastError ?? null,
    translationsByLocale: { [requestedLocale]: merged },
  };
}

/** @deprecated Use pullSanityTranslationsForPage */
export async function pullLatestSanityTranslations(input: {
  auth: ApiAuthContext;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
}): Promise<{ jobId: null; status: "not_found" } | SanityDocumentJob> {
  return pullSanityTranslationsForPage(input);
}

export { sanityProjectLocalesMatch, isProjectSourceLocale } from "@/lib/sanity/sanity-locale-match";
/** @deprecated Use sanityProjectLocalesMatch — exact project tags only. */
export const sanityLocalesMatch = sanityProjectLocalesMatch;
