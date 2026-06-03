import { and, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { getFileStorageAdapter } from "@/lib/file-storage";
import { resolveSourcePath, resolveTargetPath } from "@/lib/i18n/i18n-pathresolver";
import { isSafeRepositoryRelativePath } from "@/lib/i18n/safe-repository-path";
import { bufferFromStream } from "@/lib/primitives/streams";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

import {
  extractI18nBucketFilePatternsFromConfigJson,
  pathMatchesPattern,
} from "./github-repository-automation-localisation-paths";

export type PullTranslationExportCandidate = {
  sourcePath: string;
  targetPath: string;
  locale: string;
  translationJobId: string;
  outputFileId: string;
  content: Buffer;
};

type FileJobOutputFile = {
  fileId: string;
  locale: string;
  filename: string;
};

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseFileJobOutputFiles(input: {
  outcomeKind: string | null;
  outcomePayload: unknown;
}): FileJobOutputFile[] {
  if (input.outcomeKind !== "file_result") {
    return [];
  }

  if (!input.outcomePayload || typeof input.outcomePayload !== "object") {
    return [];
  }

  const outputFiles = (input.outcomePayload as Record<string, unknown>).outputFiles;
  if (!Array.isArray(outputFiles)) {
    return [];
  }

  const parsed: FileJobOutputFile[] = [];
  for (const item of outputFiles) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (!hasValue(record.fileId) || !hasValue(record.locale) || !hasValue(record.filename)) {
      continue;
    }
    parsed.push({
      fileId: record.fileId,
      locale: record.locale,
      filename: record.filename,
    });
  }

  return parsed;
}

function parseI18nLocales(config: Record<string, unknown>): {
  sourceLocale: string;
  targetLocales: string[];
} | null {
  const locales = config.locales;
  if (!locales || typeof locales !== "object") {
    return null;
  }

  const record = locales as Record<string, unknown>;
  if (!hasValue(record.source)) {
    return null;
  }

  const targets = record.targets;
  if (!Array.isArray(targets)) {
    return null;
  }

  const targetLocales = targets.filter((locale): locale is string => hasValue(locale));
  if (targetLocales.length === 0) {
    return null;
  }

  return {
    sourceLocale: record.source,
    targetLocales,
  };
}

type BucketFileMapping = {
  fromPattern: string;
  toPattern: string;
};

function collectBucketFileMappings(config: Record<string, unknown>): BucketFileMapping[] {
  const buckets = config.buckets;
  if (!buckets || typeof buckets !== "object") {
    return [];
  }

  const mappings: BucketFileMapping[] = [];
  for (const bucket of Object.values(buckets)) {
    if (!bucket || typeof bucket !== "object") {
      continue;
    }

    const files = (bucket as Record<string, unknown>).files;
    if (!Array.isArray(files)) {
      continue;
    }

    for (const file of files) {
      if (!file || typeof file !== "object") {
        continue;
      }
      const entry = file as Record<string, unknown>;
      if (!hasValue(entry.from) || !hasValue(entry.to)) {
        continue;
      }
      mappings.push({ fromPattern: entry.from, toPattern: entry.to });
    }
  }

  return mappings;
}

function findBucketMappingForSourcePath(
  sourcePath: string,
  mappings: BucketFileMapping[],
  sourceLocale: string,
): BucketFileMapping | null {
  for (const mapping of mappings) {
    const resolvedSource = resolveSourcePath(mapping.fromPattern, sourceLocale);
    if (
      sourcePath === resolvedSource ||
      pathMatchesPattern(sourcePath, mapping.fromPattern) ||
      pathMatchesPattern(sourcePath, resolvedSource)
    ) {
      return mapping;
    }
  }

  return null;
}

export async function listPullTranslationExportCandidates(input: {
  organizationId: string;
  projectId: string;
  configJson: Record<string, unknown>;
}): Promise<PullTranslationExportCandidate[]> {
  const locales = parseI18nLocales(input.configJson);
  if (!locales) {
    return [];
  }

  const patterns = extractI18nBucketFilePatternsFromConfigJson(input.configJson);
  if (patterns.targetPatterns.length === 0) {
    return [];
  }

  const mappings = collectBucketFileMappings(input.configJson);
  if (mappings.length === 0) {
    return [];
  }

  const versionsSubquery = db
    .select({
      versionId: schema.repositorySourceFileVersions.id,
      sourcePath: schema.repositorySourceFileVersions.sourcePath,
      rowNumber:
        sql<number>`ROW_NUMBER() OVER (PARTITION BY ${schema.repositorySourceFileVersions.sourcePath} ORDER BY ${schema.repositorySourceFileVersions.createdAt} DESC)`.as(
          "rn",
        ),
    })
    .from(schema.repositorySourceFileVersions)
    .innerJoin(
      schema.storedFiles,
      eq(schema.storedFiles.id, schema.repositorySourceFileVersions.storedFileId),
    )
    .where(
      and(
        eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
        eq(schema.repositorySourceFileVersions.projectId, input.projectId),
        eq(schema.storedFiles.role, "source"),
        eq(schema.storedFiles.sourceKind, "repository_file"),
      ),
    )
    .as("versions_sq");

  const versions = await db
    .select({
      versionId: versionsSubquery.versionId,
      sourcePath: versionsSubquery.sourcePath,
    })
    .from(versionsSubquery)
    .where(eq(versionsSubquery.rowNumber, 1));

  if (versions.length === 0) {
    return [];
  }

  const versionIds = versions.map((version) => version.versionId);
  const jobsSubquery = db
    .select({
      versionId: schema.translationJobDetails.sourceFileVersionId,
      jobId: schema.jobs.id,
      jobStatus: schema.jobs.status,
      outcomeKind: schema.translationJobDetails.outcomeKind,
      outcomePayload: schema.jobs.outcomePayload,
      rowNumber:
        sql<number>`ROW_NUMBER() OVER (PARTITION BY ${schema.translationJobDetails.sourceFileVersionId} ORDER BY ${schema.jobs.createdAt} DESC)`.as(
          "rn",
        ),
    })
    .from(schema.jobs)
    .innerJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(
      and(
        eq(schema.jobs.projectId, input.projectId),
        eq(schema.jobs.organizationId, input.organizationId),
        eq(schema.translationJobDetails.type, "file"),
        eq(schema.jobs.status, "succeeded"),
        inArray(schema.translationJobDetails.sourceFileVersionId, versionIds),
      ),
    )
    .as("jobs_sq");

  const jobRows = await db
    .select({
      versionId: jobsSubquery.versionId,
      jobId: jobsSubquery.jobId,
      outcomeKind: jobsSubquery.outcomeKind,
      outcomePayload: jobsSubquery.outcomePayload,
    })
    .from(jobsSubquery)
    .where(eq(jobsSubquery.rowNumber, 1));

  const versionById = new Map(versions.map((version) => [version.versionId, version.sourcePath]));
  const planned: Array<{
    sourcePath: string;
    targetPath: string;
    locale: string;
    translationJobId: string;
    outputFileId: string;
  }> = [];

  for (const job of jobRows) {
    if (!job.versionId) {
      continue;
    }

    const sourcePath = versionById.get(job.versionId);
    if (!sourcePath) {
      continue;
    }

    const mapping = findBucketMappingForSourcePath(sourcePath, mappings, locales.sourceLocale);
    if (!mapping) {
      continue;
    }

    const outputs = parseFileJobOutputFiles({
      outcomeKind: job.outcomeKind,
      outcomePayload: job.outcomePayload,
    });
    for (const output of outputs) {
      if (!locales.targetLocales.includes(output.locale)) {
        continue;
      }

      const targetPath = resolveTargetPath(mapping.toPattern, locales.sourceLocale, output.locale);
      if (!isSafeRepositoryRelativePath(targetPath)) {
        continue;
      }

      planned.push({
        sourcePath,
        targetPath,
        locale: output.locale,
        translationJobId: job.jobId,
        outputFileId: output.fileId,
      });
    }
  }

  if (planned.length === 0) {
    return [];
  }

  const outputFileIds = [...new Set(planned.map((item) => item.outputFileId))];
  const storedFiles = await db
    .select({
      id: schema.storedFiles.id,
      storageKey: schema.storedFiles.storageKey,
    })
    .from(schema.storedFiles)
    .where(
      and(
        eq(schema.storedFiles.organizationId, input.organizationId),
        eq(schema.storedFiles.projectId, input.projectId),
        eq(schema.storedFiles.role, "output"),
        inArray(schema.storedFiles.id, outputFileIds),
      ),
    );

  const storageKeyById = new Map(storedFiles.map((file) => [file.id, file.storageKey]));
  const adapter = getFileStorageAdapter();

  const candidates = await mapWithConcurrency(planned, 5, async (item) => {
    const storageKey = storageKeyById.get(item.outputFileId);
    if (!storageKey) {
      return null;
    }

    const object = await adapter.get({ keyOrUrl: storageKey });
    if (!object) {
      return null;
    }

    const content = await bufferFromStream(object.body);
    return {
      ...item,
      content,
    } satisfies PullTranslationExportCandidate;
  });

  return candidates.filter(
    (candidate): candidate is PullTranslationExportCandidate => candidate !== null,
  );
}
