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
import { omitMultiWordSameAsSourceTranslations } from "@/lib/projects/translations/should-retry-same-as-source-prefill";
import { parseIntegrationJsonFileExtracted } from "@/workflows/file-translation-progress";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

import {
  buildFigmaPageFileName,
  buildFigmaPageSourcePath,
  buildFigmaSourcePath,
  isFigmaStampSegmentKey,
  parseTranslationFile,
  propagateFigmaTranslationsBySharedSource,
  segmentsToTranslationFile,
} from "./segment-file";
import type {
  CollectedFigmaPage,
  CollectFigmaPageResult,
  FigmaCurrentJobResult,
  FigmaDesignSegment,
  FigmaJobStatusName,
  FigmaLocalePageStatus,
  FigmaLocaleStatusesResult,
  FigmaLocalizationStatus,
  FigmaPageJob,
  FigmaSourcePullEntry,
  FigmaSourcePullPage,
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

/** Parses file-result outcome payloads for Figma pull/status responses. */
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
    input.sourceByKey && Object.keys(input.sourceByKey).some(isFigmaStampSegmentKey);

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

    const stampOnly = parseTranslationFile(parsed);
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
export function mergeFigmaPullTranslations(
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

function languageSubtag(locale: string): string | null {
  const canonical = canonicalizeLocale(locale);
  if (!canonical) {
    return null;
  }
  try {
    return new Intl.Locale(canonical).language;
  } catch {
    return null;
  }
}

function localeRegion(locale: string): string | null {
  const canonical = canonicalizeLocale(locale);
  if (!canonical) {
    return null;
  }
  try {
    const region = new Intl.Locale(canonical).region;
    return region ?? null;
  } catch {
    return null;
  }
}

/** True when two locale tags refer to the same language choice in plugin/API flows. */
export function figmaLocalesMatch(a: string, b: string): boolean {
  const trimmedA = a.trim();
  const trimmedB = b.trim();
  if (!trimmedA || !trimmedB) {
    return false;
  }
  if (trimmedA === trimmedB) {
    return true;
  }
  if (localeKey(trimmedA) === localeKey(trimmedB)) {
    return true;
  }
  const canonicalA = canonicalizeLocale(trimmedA);
  const canonicalB = canonicalizeLocale(trimmedB);
  if (canonicalA && canonicalB && canonicalA === canonicalB) {
    return true;
  }
  const langA = languageSubtag(trimmedA);
  const langB = languageSubtag(trimmedB);
  if (!langA || !langB || langA !== langB) {
    return false;
  }
  const regionA = localeRegion(trimmedA);
  const regionB = localeRegion(trimmedB);
  if (!regionA || !regionB) {
    return true;
  }
  return regionA === regionB;
}

export function isProjectSourceLocale(projectSourceLocale: string, locale: string): boolean {
  return figmaLocalesMatch(projectSourceLocale, locale);
}

function sliceFigmaPageJobForLocale(job: FigmaPageJob, locale: string): FigmaPageJob {
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

  const languageMatches = Object.entries(translationsByLocale).filter(
    ([entryLocale, translations]) => {
      if (countNonEmptyTranslations(translations) === 0) {
        return false;
      }
      return figmaLocalesMatch(trimmed, entryLocale);
    },
  );
  if (languageMatches.length === 1) {
    return languageMatches[0]![1];
  }

  return undefined;
}

function countNonEmptyTranslations(translations: Record<string, string>): number {
  return Object.values(translations).filter((value) => value.trim().length > 0).length;
}

async function loadFigmaEditorTranslationsBySourcePath(input: {
  organizationId: string;
  projectId: string;
  locale: string;
  sourcePath: string;
}): Promise<Record<string, string>> {
  const rows = await db
    .select({
      key: schema.projectTranslationKeys.key,
      text: schema.projectTranslations.text,
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
        eq(schema.repositorySourceFiles.sourcePath, input.sourcePath),
      ),
    );

  const segments: Record<string, string> = {};
  for (const row of rows) {
    if (row.text.trim().length === 0 || !isFigmaStampSegmentKey(row.key)) {
      continue;
    }
    segments[row.key] = row.text;
  }
  return segments;
}

async function mergeFigmaTranslationsWithEditor(input: {
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
      const editor = await loadFigmaEditorTranslationsBySourcePath({
        organizationId: input.organizationId,
        projectId: input.projectId,
        locale,
        sourcePath: input.sourcePath,
      });
      let merged = mergeFigmaPullTranslations(
        editor,
        input.jobTranslations[locale] ?? {},
        input.sourceByKey,
      );
      if (input.sourceByKey && countNonEmptyTranslations(input.sourceByKey) > 0) {
        merged = propagateFigmaTranslationsBySharedSource(input.sourceByKey, merged);
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

/** True when a translation job was created by the Figma plugin integration. */
export function isFigmaIntegrationJob(inputPayload: unknown) {
  return readMetadataString(inputPayload, "integration") === "figma-plugin";
}

/** True when job metadata points at this Figma file and page. */
export function figmaJobMatchesPage(
  inputPayload: unknown,
  input: { fileKey: string; pageId: string },
) {
  return (
    isFigmaIntegrationJob(inputPayload) &&
    readMetadataString(inputPayload, "figmaFileKey") === input.fileKey &&
    readMetadataString(inputPayload, "figmaPageId") === input.pageId
  );
}

const FIGMA_JOB_STATUSES = new Set<FigmaJobStatusName>([
  "queued",
  "running",
  "waiting_for_review",
  "succeeded",
  "failed",
  "cancelled",
]);

export function publicFigmaJobStatus(status: string): FigmaJobStatusName {
  if (FIGMA_JOB_STATUSES.has(status as FigmaJobStatusName)) {
    return status as FigmaJobStatusName;
  }
  return "queued";
}

export function figmaJobHasPullableTranslations(status: FigmaJobStatusName) {
  return status === "succeeded" || status === "waiting_for_review";
}

export const FIGMA_SOURCE_INGEST_WAIT_TIMEOUT_MS = 20_000;
export const FIGMA_SOURCE_INGEST_WAIT_INTERVAL_MS = 500;

export function figmaSourceIngestIsSettled(state: string | null | undefined) {
  return state != null && !isSourceFileIngestInProgress(state as SourceFileIngestState);
}

async function loadFigmaSourceIngestStates(input: {
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

export async function waitForFigmaSourceIngest(input: {
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
  const loadStates = input.loadStates ?? (() => loadFigmaSourceIngestStates(input));
  const startedAt = now();

  while (true) {
    const states = await loadStates();
    if (
      states.length === input.sourcePaths.length &&
      states.every((state) => figmaSourceIngestIsSettled(state))
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

type FigmaJobSnapshot = {
  id: string;
  status: string;
  projectId: string | null;
  inputPayload: unknown;
  lastError: string | null;
  type: string | null;
  outcomeKind: string | null;
  outcomePayload: unknown;
};

function figmaJobSelectFields() {
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

async function toFigmaPageJob(input: {
  job: FigmaJobSnapshot;
  organizationId: string;
}): Promise<FigmaPageJob> {
  const projectId = input.job.projectId;
  if (!projectId) {
    throw new Error("translation_job_missing_project");
  }

  const status = publicFigmaJobStatus(input.job.status);
  const sourcePath =
    readMetadataString(input.job.inputPayload, "sourcePath") ??
    normalizeSourcePath(
      buildFigmaSourcePath(
        readMetadataString(input.job.inputPayload, "figmaFileKey") ?? "unknown",
        readMetadataString(input.job.inputPayload, "figmaPageId") ?? "unknown",
      ),
    );

  let translationsByLocale: Record<string, Record<string, string>> = {};
  const targetLocales = readJobTargetLocales(input.job.inputPayload);
  if (figmaJobHasPullableTranslations(status)) {
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
        const sourceFile = parseTranslationFile(parsed);
        for (const [key, value] of Object.entries(sourceFile)) {
          if (isFigmaStampSegmentKey(key) && value.trim().length > 0) {
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
    translationsByLocale = await mergeFigmaTranslationsWithEditor({
      organizationId: input.organizationId,
      projectId,
      sourcePath,
      jobTranslations,
      targetLocales,
      sourceByKey,
    });

    if (jobSourceLocale && countNonEmptyTranslations(sourceByKey) > 0) {
      const editorSource = await loadFigmaEditorTranslationsBySourcePath({
        organizationId: input.organizationId,
        projectId,
        locale: jobSourceLocale,
        sourcePath,
      });
      const mergedSource = mergeFigmaPullTranslations(editorSource, sourceByKey);
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

function readStoredFileMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function countFigmaTranslatedKeys(translations: Record<string, string>, total: number) {
  let translated = 0;
  for (const value of Object.values(translations)) {
    if (value.trim().length > 0) {
      translated += 1;
    }
  }
  return Math.min(translated, total);
}

export async function collectFigmaPage(input: {
  auth: ApiAuthContext;
  apiKeyId: string;
  projectId: string;
  fileKey: string;
  pageId: string;
  fileName?: string;
  pageName?: string;
  segments: FigmaDesignSegment[];
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<CollectFigmaPageResult> {
  const project = await getAccessibleFigmaProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("figma_project_not_found");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const sourcePath = buildFigmaPageSourcePath({
    fileName: input.fileName,
    fileKey: input.fileKey,
    pageName: input.pageName,
    pageId: input.pageId,
  });
  const translationFile = segmentsToTranslationFile(input.segments);
  const segmentCount = Object.keys(translationFile).length;
  if (segmentCount === 0) {
    throw new Error("figma_no_text_segments");
  }

  const fileBody = JSON.stringify(translationFile, null, 2);
  const sourceHash = createHash("sha256").update(fileBody).digest("hex");
  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();
  const filename = buildFigmaPageFileName({
    pageName: input.pageName,
    pageId: input.pageId,
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
      uploadSurface: "figma_plugin",
      integration: "figma-plugin",
      figmaFileKey: input.fileKey,
      figmaPageId: input.pageId,
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
    uploadSurface: "figma_plugin",
  });

  void enqueueSourceFileIngestAfterUpload({
    organizationId,
    projectId: project.id,
    storedFileId: storedFile.id,
    sourceFileVersionId: version.id,
    sourcePath,
    sourceHash,
  }).catch(() => {});

  return {
    projectId: project.id,
    sourceFileId: storedFile.id,
    sourcePath,
    segmentCount,
  };
}

export async function listCollectedFigmaPages(input: {
  organizationId: string;
  projectId: string;
  fileKey: string;
  pageIds: string[];
}): Promise<CollectedFigmaPage[]> {
  const uniquePageIds = [...new Set(input.pageIds.filter((pageId) => pageId.trim().length > 0))];
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
        sql`${schema.storedFiles.metadata}->>'integration' = 'figma-plugin'`,
        sql`${schema.storedFiles.metadata}->>'figmaFileKey' = ${input.fileKey}`,
        or(
          ...uniquePageIds.map(
            (pageId) => sql`${schema.storedFiles.metadata}->>'figmaPageId' = ${pageId}`,
          ),
        ),
      ),
    )
    .orderBy(desc(schema.storedFiles.createdAt));

  const latestByPageId = new Map<string, CollectedFigmaPage>();
  for (const row of rows) {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const pageId = readStoredFileMetadataString(metadata, "figmaPageId");
    const sourcePath = readStoredFileMetadataString(metadata, "sourcePath");
    if (!pageId || !sourcePath || latestByPageId.has(pageId)) {
      continue;
    }
    const segmentCount =
      typeof metadata.segmentCount === "number" && Number.isFinite(metadata.segmentCount)
        ? metadata.segmentCount
        : 0;
    latestByPageId.set(pageId, {
      pageId,
      sourcePath,
      sourceFileId: row.id,
      segmentCount,
    });
  }

  return uniquePageIds
    .map((pageId) => latestByPageId.get(pageId))
    .filter((page): page is CollectedFigmaPage => page != null);
}

async function listFigmaFileJobs(input: {
  auth: ApiAuthContext;
  projectId: string;
  fileKey: string;
}): Promise<FigmaJobSnapshot[]> {
  const organizationId = input.auth.organization.localOrganizationId;
  const accessibleJobsWhere = await buildAccessibleJobsWhere(input.auth);
  const rows = await db
    .select(figmaJobSelectFields())
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(
      and(
        eq(schema.jobs.organizationId, organizationId),
        eq(schema.jobs.kind, "translation"),
        eq(schema.jobs.projectId, input.projectId),
        accessibleJobsWhere,
        sql`${schema.jobs.inputPayload}->'metadata'->>'integration' = 'figma-plugin'`,
        sql`${schema.jobs.inputPayload}->'metadata'->>'figmaFileKey' = ${input.fileKey}`,
      ),
    )
    .orderBy(desc(schema.jobs.createdAt));

  return rows.filter(
    (job) =>
      isFigmaIntegrationJob(job.inputPayload) &&
      readMetadataString(job.inputPayload, "figmaFileKey") === input.fileKey,
  );
}

export async function listFigmaPageLocaleStatuses(input: {
  auth: ApiAuthContext;
  projectId: string;
  fileKey: string;
  pageIds: string[];
}): Promise<FigmaLocaleStatusesResult> {
  const project = await getAccessibleFigmaProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("figma_project_not_found");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const pageIds = [...new Set(input.pageIds.filter((pageId) => pageId.trim().length > 0))];
  const pages = await listCollectedFigmaPages({
    organizationId,
    projectId: project.id,
    fileKey: input.fileKey,
    pageIds,
  });
  const collectedByPageId = new Map(pages.map((page) => [page.pageId, page]));
  const jobs = await listFigmaFileJobs({
    auth: input.auth,
    projectId: project.id,
    fileKey: input.fileKey,
  });

  const sourceLocale = project.sourceLocale?.trim() || "en";
  const targetLocales = project.targetLocales ?? [];

  const sourcePages: FigmaLocalePageStatus[] = pageIds.map((pageId) => ({
    pageId,
    status: collectedByPageId.has(pageId) ? "succeeded" : "missing",
  }));

  const locales: FigmaLocaleStatusesResult["locales"] = [
    {
      locale: sourceLocale,
      isSource: true,
      pages: sourcePages,
    },
  ];

  for (const locale of targetLocales) {
    const trimmed = locale.trim();
    if (!trimmed || trimmed === sourceLocale) {
      continue;
    }

    const localePages: FigmaLocalePageStatus[] = [];
    for (const pageId of pageIds) {
      const collected = collectedByPageId.get(pageId);
      if (!collected) {
        localePages.push({ pageId, status: "missing" });
        continue;
      }

      const job = jobs.find(
        (candidate) =>
          figmaJobMatchesPage(candidate.inputPayload, {
            fileKey: input.fileKey,
            pageId,
          }) &&
          readJobTargetLocales(candidate.inputPayload).some((target) =>
            figmaLocalesMatch(target, trimmed),
          ),
      );

      if (job) {
        localePages.push({ pageId, status: publicFigmaJobStatus(job.status) });
        continue;
      }

      const editorSegments = await loadFigmaEditorTranslationsBySourcePath({
        organizationId,
        projectId: project.id,
        locale: trimmed,
        sourcePath: collected.sourcePath,
      });
      const editorTranslated = countFigmaTranslatedKeys(editorSegments, collected.segmentCount);
      if (editorTranslated > 0) {
        localePages.push({ pageId, status: "waiting_for_review" });
      } else {
        localePages.push({ pageId, status: "missing" });
      }
    }

    locales.push({
      locale: trimmed,
      isSource: false,
      pages: localePages,
    });
  }

  return { locales, pages };
}

export async function startFigmaLocalization(input: {
  auth: ApiAuthContext;
  apiKeyId: string;
  projectId: string;
  fileKey: string;
  pageId: string;
  fileName?: string;
  pageName?: string;
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
  const collected = await collectFigmaPage({
    auth: input.auth,
    apiKeyId: input.apiKeyId,
    projectId: project.id,
    fileKey: input.fileKey,
    pageId: input.pageId,
    fileName: input.fileName,
    pageName: input.pageName,
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
      integration: "figma-plugin",
      figmaFileKey: input.fileKey,
      figmaPageId: input.pageId,
      sourcePath: collected.sourcePath,
    },
  });
  if (!created.ok) {
    throw new Error(created.code);
  }

  if (input.generate) {
    const ingestReady = await waitForFigmaSourceIngest({
      organizationId,
      projectId: project.id,
      sourcePaths: [collected.sourcePath],
    });
    if (!ingestReady) {
      throw new Error("figma_source_ingest_timeout");
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

export async function generateFigmaLocaleJobs(input: {
  auth: ApiAuthContext;
  projectId: string;
  fileKey: string;
  pageId: string;
  sourceLocale?: string;
  targetLocales: string[];
  jobQueue: JobQueue<TranslationJobEventData>;
}): Promise<StartFigmaLocalizationResult> {
  const project = await getAccessibleFigmaProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("figma_project_not_found");
  }

  const sourceLocale = input.sourceLocale?.trim() || project.sourceLocale?.trim() || "";
  const localeValidation = validateJobLocalesAgainstProject(project, {
    sourceLocale,
    targetLocales: input.targetLocales,
  });
  if (isErr(localeValidation)) {
    throw new Error(localeValidation.error.code);
  }

  const collected = await findLatestFigmaCollectedPage({
    auth: input.auth,
    fileKey: input.fileKey,
    pageId: input.pageId,
    projectId: project.id,
  });
  if (!collected) {
    throw new Error("figma_page_not_collected");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const ingestReady = await waitForFigmaSourceIngest({
    organizationId,
    projectId: project.id,
    sourcePaths: [collected.sourcePath],
  });
  if (!ingestReady) {
    throw new Error("figma_source_ingest_timeout");
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
      integration: "figma-plugin",
      figmaFileKey: input.fileKey,
      figmaPageId: input.pageId,
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

async function findLatestFigmaCollectedPage(input: {
  auth: ApiAuthContext;
  fileKey: string;
  pageId: string;
  projectId: string;
}): Promise<{ sourceFileId: string; sourcePath: string } | null> {
  const organizationId = input.auth.organization.localOrganizationId;
  const pages = await listCollectedFigmaPages({
    organizationId,
    projectId: input.projectId,
    fileKey: input.fileKey,
    pageIds: [input.pageId],
  });
  const page = pages[0];
  if (!page) {
    return null;
  }
  return { sourceFileId: page.sourceFileId, sourcePath: page.sourcePath };
}

async function getFigmaTranslationJobSnapshot(input: {
  jobId: string;
  organizationId: string;
  auth: ApiAuthContext;
}) {
  const accessibleJobsWhere = await buildAccessibleJobsWhere(input.auth);
  const [job] = await db
    .select(figmaJobSelectFields())
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

  return toFigmaPageJob({
    job,
    organizationId: input.auth.organization.localOrganizationId,
  });
}

async function findLatestFigmaPageJob(input: {
  auth: ApiAuthContext;
  fileKey: string;
  pageId: string;
  projectId?: string;
}): Promise<FigmaJobSnapshot | null> {
  const organizationId = input.auth.organization.localOrganizationId;
  const accessibleJobsWhere = await buildAccessibleJobsWhere(input.auth);
  const conditions = [
    eq(schema.jobs.organizationId, organizationId),
    eq(schema.jobs.kind, "translation"),
    accessibleJobsWhere,
    sql`${schema.jobs.inputPayload}->'metadata'->>'integration' = 'figma-plugin'`,
    sql`${schema.jobs.inputPayload}->'metadata'->>'figmaFileKey' = ${input.fileKey}`,
    sql`${schema.jobs.inputPayload}->'metadata'->>'figmaPageId' = ${input.pageId}`,
  ];

  if (input.projectId) {
    conditions.push(eq(schema.jobs.projectId, input.projectId));
  }

  const [job] = await db
    .select(figmaJobSelectFields())
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(and(...conditions))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);

  if (!job || !figmaJobMatchesPage(job.inputPayload, input) || !job.projectId) {
    return null;
  }

  return job;
}

export async function getCurrentFigmaPageJob(input: {
  auth: ApiAuthContext;
  fileKey: string;
  pageId: string;
  projectId?: string;
}): Promise<FigmaCurrentJobResult> {
  if (input.projectId) {
    const project = await getAccessibleFigmaProject(input.auth, input.projectId);
    if (!project) {
      throw new Error("figma_project_not_found");
    }
  }

  const job = await findLatestFigmaPageJob(input);
  if (!job) {
    return { job: null };
  }

  return {
    job: await toFigmaPageJob({
      job,
      organizationId: input.auth.organization.localOrganizationId,
    }),
  };
}

async function loadFigmaKnownTextsBySourcePath(input: {
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
    if (row.text.trim().length === 0 || !row.sourcePath || !isFigmaStampSegmentKey(row.key)) {
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

export function buildFigmaSourcePullEntries(input: {
  sourceFile: Record<string, string>;
  knownTextsByKey: Map<string, string[]>;
}): FigmaSourcePullEntry[] {
  const entries: FigmaSourcePullEntry[] = [];
  for (const [key, sourceRaw] of Object.entries(input.sourceFile)) {
    if (!isFigmaStampSegmentKey(key)) {
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

export async function pullFigmaSourcePageForUpload(input: {
  auth: ApiAuthContext;
  projectId: string;
  fileKey: string;
  pageId: string;
}): Promise<FigmaSourcePullPage> {
  const project = await getAccessibleFigmaProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("figma_project_not_found");
  }
  const projectSourceLocale = project.sourceLocale?.trim();
  if (!projectSourceLocale) {
    throw new Error("figma_project_source_locale_missing");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const sourcePathDefault = buildFigmaPageSourcePath({
    fileKey: input.fileKey,
    pageId: input.pageId,
  });

  const collected = await findLatestFigmaCollectedPage({
    auth: input.auth,
    fileKey: input.fileKey,
    pageId: input.pageId,
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
    sourceFile = parseTranslationFile(parsed);
  } catch {
    return {
      locale: projectSourceLocale,
      sourcePath,
      needsReupload: true,
      entries: [],
    };
  }

  const knownTextsByKey = await loadFigmaKnownTextsBySourcePath({
    organizationId,
    projectId: project.id,
    sourcePaths: [sourcePath],
  });
  const entries = buildFigmaSourcePullEntries({ sourceFile, knownTextsByKey });

  return {
    locale: projectSourceLocale,
    sourcePath,
    needsReupload: entries.length === 0,
    entries,
  };
}

export async function pullFigmaPageLocaleContent(input: {
  auth: ApiAuthContext;
  projectId: string;
  fileKey: string;
  pageId: string;
  locale?: string;
}): Promise<
  | { kind: "source"; sourcePage: FigmaSourcePullPage }
  | { kind: "job"; translations: { jobId: null; status: "not_found" } | FigmaPageJob }
> {
  const project = await getAccessibleFigmaProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("figma_project_not_found");
  }
  const projectSourceLocale = project.sourceLocale?.trim();
  if (!projectSourceLocale) {
    throw new Error("figma_project_source_locale_missing");
  }

  const requestedLocale = input.locale?.trim();
  if (requestedLocale && isProjectSourceLocale(projectSourceLocale, requestedLocale)) {
    return {
      kind: "source",
      sourcePage: await pullFigmaSourcePageForUpload(input),
    };
  }

  return {
    kind: "job",
    translations: await pullFigmaTranslationsForPage(input),
  };
}

function readJobTargetLocalesIncludes(inputPayload: unknown, locale: string): boolean {
  return readJobTargetLocales(inputPayload).some((target) => figmaLocalesMatch(target, locale));
}

async function findLatestFigmaPageJobForLocale(input: {
  auth: ApiAuthContext;
  fileKey: string;
  pageId: string;
  projectId: string;
  locale: string;
}): Promise<FigmaJobSnapshot | null> {
  const jobs = await listFigmaFileJobs({
    auth: input.auth,
    projectId: input.projectId,
    fileKey: input.fileKey,
  });
  return (
    jobs.find(
      (job) =>
        figmaJobMatchesPage(job.inputPayload, {
          fileKey: input.fileKey,
          pageId: input.pageId,
        }) && readJobTargetLocalesIncludes(job.inputPayload, input.locale),
    ) ?? null
  );
}

export async function pullFigmaTranslationsForPage(input: {
  auth: ApiAuthContext;
  projectId: string;
  fileKey: string;
  pageId: string;
  locale?: string;
}): Promise<{ jobId: null; status: "not_found" } | FigmaPageJob> {
  const project = await getAccessibleFigmaProject(input.auth, input.projectId);
  if (!project) {
    throw new Error("figma_project_not_found");
  }

  const organizationId = input.auth.organization.localOrganizationId;
  const requestedLocale = input.locale?.trim();

  if (!requestedLocale) {
    const job = await findLatestFigmaPageJob({
      auth: input.auth,
      fileKey: input.fileKey,
      pageId: input.pageId,
      projectId: project.id,
    });
    if (!job) {
      return { jobId: null, status: "not_found" };
    }
    return toFigmaPageJob({ job, organizationId });
  }

  const job = await findLatestFigmaPageJobForLocale({
    auth: input.auth,
    fileKey: input.fileKey,
    pageId: input.pageId,
    projectId: project.id,
    locale: requestedLocale,
  });
  if (job) {
    const pageJob = await toFigmaPageJob({ job, organizationId });
    if (pickTranslationsForLocale(pageJob.translationsByLocale, requestedLocale)) {
      return sliceFigmaPageJobForLocale(pageJob, requestedLocale);
    }
  }

  const collected = await findLatestFigmaCollectedPage({
    auth: input.auth,
    fileKey: input.fileKey,
    pageId: input.pageId,
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
    const sourceFile = parseTranslationFile(parsed);
    for (const [key, value] of Object.entries(sourceFile)) {
      if (isFigmaStampSegmentKey(key) && value.trim().length > 0) {
        sourceByKey[key] = value;
      }
    }
  } catch {
    return { jobId: null, status: "not_found" };
  }

  const editor = await loadFigmaEditorTranslationsBySourcePath({
    organizationId,
    projectId: project.id,
    locale: requestedLocale,
    sourcePath: collected.sourcePath,
  });
  const merged = propagateFigmaTranslationsBySharedSource(
    sourceByKey,
    mergeFigmaPullTranslations(editor, {}, sourceByKey),
  );
  if (countNonEmptyTranslations(merged) === 0) {
    return { jobId: null, status: "not_found" };
  }

  return {
    jobId: job?.id ?? "",
    status: job ? publicFigmaJobStatus(job.status) : "waiting_for_review",
    projectId: project.id,
    sourcePath: collected.sourcePath,
    targetLocales: job ? readJobTargetLocales(job.inputPayload) : [requestedLocale],
    lastError: job?.lastError ?? null,
    translationsByLocale: { [requestedLocale]: merged },
  };
}

/** @deprecated Use pullFigmaTranslationsForPage */
export async function pullLatestFigmaTranslations(input: {
  auth: ApiAuthContext;
  projectId: string;
  fileKey: string;
  pageId: string;
}): Promise<{ jobId: null; status: "not_found" } | FigmaPageJob> {
  return pullFigmaTranslationsForPage(input);
}
