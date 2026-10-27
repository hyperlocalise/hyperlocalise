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
import { and, eq } from "drizzle-orm";

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

async function loadSpanSourceTexts(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
}): Promise<Record<string, string>> {
  const sourceSpans: Record<string, string> = {};
  for (let offset = 0; ; offset += SPAN_SOURCE_PAGE_SIZE) {
    const keys = await listProjectTranslationKeysForFile({
      ...input,
      limit: SPAN_SOURCE_PAGE_SIZE,
      offset,
    });
    for (const key of keys) {
      if (SRX_SPAN_KEY_PATTERN.test(key.key)) {
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
): Promise<Uint8Array> {
  const rendered = await createGoSvcServerClient().translationFile.render(
    { source, request },
    { signal: AbortSignal.timeout(RENDER_TIMEOUT_MS) },
  );
  return new Uint8Array(await rendered.blob.arrayBuffer());
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
        projectId: input.projectId,
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

  const hasSpanTranslations = Object.keys(translations.prefilled).some((key) =>
    SRX_SPAN_KEY_PATTERN.test(key),
  );
  const sourceSpans = hasSpanTranslations
    ? await loadSpanSourceTexts({
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: sourceFile.repositorySourceFileId,
      })
    : {};

  const rendered = await fromThrowableAsync(
    renderWithGoSvc(source.value.content, {
      sourcePath: input.sourcePath,
      sourceLocale: project?.sourceLocale ?? "",
      targetLocale: input.targetLocale,
      values: translations.prefilled,
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
    });
  }

  return {
    kind: "file",
    content: rendered.value,
    contentType: source.value.file.contentType || "application/octet-stream",
  };
}
