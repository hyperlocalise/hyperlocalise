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
import { basename } from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, schema } from "@/lib/database/client";
import { getStoredFileContent } from "@/lib/file-storage/records";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import type { RenderTranslationFileRequest } from "@/lib/go-svc/go-svc-client.types";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import { createLogger } from "@/lib/log";
import { fromThrowableAsync, isErr } from "@/lib/primitives/result/results";
import { findLatestReconciledVersionForFile } from "@/lib/projects/files/source-file-segmentation";
import {
  listProjectTranslationKeysForFile,
  loadProjectTranslationsAsPrefilledEntries,
} from "@/lib/projects/translations/project-translation-service";
import {
  inferSupportedTranslationFileFormat,
  isWholeFileTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";

const logger = createLogger("source-format-translation-download");

const RENDER_TIMEOUT_MS = 30_000;
const SPAN_SOURCE_PAGE_SIZE = 2_000;

/** Key suffix of one sentence of a string that SRX segmentation split at ingest. */
const SRX_SPAN_KEY_PATTERN = /#srx\.\d+$/;

/**
 * JSON-syntax catalogs download as key/value JSON; Lottie, subtitles and PDF have their
 * own writers.
 */
const OWN_DOWNLOAD_FORMATS: ReadonlySet<SupportedTranslationFileFormat> = new Set([
  "json",
  "jsonc",
  "arb",
  "lottie",
  "srt",
  "vtt",
  "sbv",
  "pdf",
]);

/** go-svc's limit for the source file, the same as the project upload limit. */
const RENDER_SOURCE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * A file written in its own format, or `json` when it should have been but could not be:
 * the caller then downloads the translations as JSON, named as JSON. The reason is logged.
 */
export type ProjectSourceFormatTranslationDownload =
  | { kind: "file"; content: Uint8Array; contentType: string }
  | { kind: "json" };

const JSON_FALLBACK: ProjectSourceFormatTranslationDownload = { kind: "json" };

function isWrittenInSourceFormat(sourcePath: string): boolean {
  const format = inferSupportedTranslationFileFormat(sourcePath);
  return (
    format !== null &&
    !isWholeFileTranslationFileFormat(format) &&
    !OWN_DOWNLOAD_FORMATS.has(format)
  );
}

const keyVersions = alias(schema.repositorySourceFileVersions, "key_versions");
const templateVersions = alias(schema.repositorySourceFileVersions, "template_versions");

/**
 * Keys last read from a version older than the template. Reconciling a version stamps
 * every key it has with that version, in the same transaction that makes it the file's
 * reconciled version, so an older stamp means the template does not have the key: a
 * repository sync hides such keys, with their translations, instead of deleting them.
 * Nothing is left out when the template is not the file's reconciled version (a file
 * never reconciled, or a version reconciled during the download); keys the template lacks
 * then match nothing and the download falls back to JSON.
 */
async function loadKeysOlderThanTemplate(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  sourceFileVersionId: string;
}): Promise<Set<string>> {
  const rows = await db
    .select({ key: schema.projectTranslationKeys.key })
    .from(schema.projectTranslationKeys)
    .innerJoin(keyVersions, eq(keyVersions.id, schema.projectTranslationKeys.sourceFileVersionId))
    .innerJoin(
      schema.repositorySourceFiles,
      eq(schema.repositorySourceFiles.id, schema.projectTranslationKeys.repositorySourceFileId),
    )
    .innerJoin(templateVersions, eq(templateVersions.id, input.sourceFileVersionId))
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.repositorySourceFileId, input.repositorySourceFileId),
        eq(schema.repositorySourceFiles.reconciledSourceFileVersionId, input.sourceFileVersionId),
        sql`(${keyVersions.createdAt}, ${keyVersions.id}) < (${templateVersions.createdAt}, ${templateVersions.id})`,
      ),
    );
  return new Set(rows.map((row) => row.key));
}

async function loadSpanSourceTexts(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  skipKeys: ReadonlySet<string>;
}): Promise<Record<string, string>> {
  const { skipKeys, ...fileInput } = input;
  const sourceSpans: Record<string, string> = {};
  for (let offset = 0; ; offset += SPAN_SOURCE_PAGE_SIZE) {
    const keys = await listProjectTranslationKeysForFile({
      ...fileInput,
      limit: SPAN_SOURCE_PAGE_SIZE,
      offset,
    });
    for (const key of keys) {
      if (SRX_SPAN_KEY_PATTERN.test(key.key) && !skipKeys.has(key.key)) {
        sourceSpans[key.key] = key.sourceText;
      }
    }
    if (keys.length < SPAN_SOURCE_PAGE_SIZE) {
      return sourceSpans;
    }
  }
}

async function renderWithGoSvc(
  source: Uint8Array,
  request: RenderTranslationFileRequest,
): Promise<{ content: Uint8Array; unmatchedCount: number }> {
  const rendered = await createGoSvcServerClient().translationFile.render(
    { source, request },
    { signal: AbortSignal.timeout(RENDER_TIMEOUT_MS) },
  );
  return {
    content: new Uint8Array(await rendered.blob.arrayBuffer()),
    // go-svc reports, as its warning count, translations whose key the file does not have.
    unmatchedCount: rendered.warningCount,
  };
}

/**
 * Writes a file's translations into its stored source file, in the source file's own
 * format. Untranslated strings stay as the source has them. Resolves to `null` for
 * formats that are not written this way, so callers keep their own export.
 */
export async function loadProjectSourceFormatTranslationDownload(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<ProjectSourceFormatTranslationDownload | null> {
  if (!isWrittenInSourceFormat(input.sourcePath)) {
    return null;
  }
  const fallBack = (reason: string, details: Record<string, unknown> = {}) => {
    logger.warn(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        targetLocale: input.targetLocale,
        format: inferSupportedTranslationFileFormat(input.sourcePath),
        reason,
        ...details,
      },
      "translation file not written in its own format; downloading JSON",
    );
    return JSON_FALLBACK;
  };

  const translations = await loadProjectTranslationsAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    readyTranslationsOnly: true,
  });
  if (translations.loadedKeyCount === 0) {
    // The JSON download reports a file without strings.
    return JSON_FALLBACK;
  }

  // The keys were extracted from the reconciled version, so that version is the template.
  const sourceFile = await findLatestReconciledVersionForFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
  if (!sourceFile?.reconciledSourceFileVersionId) {
    return fallBack("source_version_not_found");
  }
  const [version] = await db
    .select({ storedFileId: schema.repositorySourceFileVersions.storedFileId })
    .from(schema.repositorySourceFileVersions)
    .where(
      and(
        eq(schema.repositorySourceFileVersions.id, sourceFile.reconciledSourceFileVersionId),
        eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
        eq(schema.repositorySourceFileVersions.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!version) {
    return fallBack("source_version_not_found");
  }
  const source = await fromThrowableAsync(
    getStoredFileContent({
      organizationId: input.organizationId,
      projectId: input.projectId,
      fileId: version.storedFileId,
      adapter: input.fileStorageAdapter,
    }),
  );
  if (isErr(source)) {
    return fallBack("source_content_unreadable");
  }
  if (source.value.content.byteLength > RENDER_SOURCE_MAX_BYTES) {
    return fallBack("source_too_large", { bytes: source.value.content.byteLength });
  }

  const [project] = await db
    .select({ sourceLocale: schema.projects.sourceLocale })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  // A dropped key would match nothing, and a dropped sentence would be joined over its
  // string's current translation.
  const droppedKeys = await loadKeysOlderThanTemplate({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: sourceFile.repositorySourceFileId,
    sourceFileVersionId: sourceFile.reconciledSourceFileVersionId,
  });
  const values = Object.fromEntries(
    Object.entries(translations.prefilled).filter(([key]) => !droppedKeys.has(key)),
  );

  const hasSpanTranslations = Object.keys(values).some((key) => SRX_SPAN_KEY_PATTERN.test(key));
  const sourceSpans = hasSpanTranslations
    ? await loadSpanSourceTexts({
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: sourceFile.repositorySourceFileId,
        skipKeys: droppedKeys,
      })
    : {};

  const rendered = await fromThrowableAsync(
    renderWithGoSvc(source.value.content, {
      // Ingest reads the file under its base name, which decides some layouts (a bare
      // `strings.xml` is an Android resource), so the writer gets the same name.
      sourcePath: basename(input.sourcePath),
      sourceLocale: project?.sourceLocale ?? "",
      targetLocale: input.targetLocale,
      values,
      sourceSpans,
    }),
  );
  if (isErr(rendered)) {
    // Covers a go-svc without this route yet (mid-deploy or rolled back), one that cannot
    // be reached, and a source file its writer rejects.
    const error = rendered.error;
    return fallBack("render_failed", {
      status: error instanceof GoSvcClientError ? error.status : null,
      code: error instanceof GoSvcClientError ? error.code : null,
      // The client wraps a timeout as a network error; its cause says which it was.
      causeName:
        error instanceof Error && error.cause instanceof Error
          ? error.cause.name
          : error instanceof Error
            ? error.name
            : null,
    });
  }

  // A translation that matches no key of the file means the file was read differently (an
  // older CLI's key shapes), the template is not the version the keys were read from, or
  // the string was added outside an upload (the public API); its translation would be
  // missing from the file, so JSON is the safer download.
  if (rendered.value.unmatchedCount > 0) {
    return fallBack("keys_not_matched", { unmatchedCount: rendered.value.unmatchedCount });
  }

  return {
    kind: "file",
    content: rendered.value.content,
    contentType: source.value.file.contentType || "application/octet-stream",
  };
}
