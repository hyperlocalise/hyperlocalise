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
import type { RenderTranslationFileBody } from "@/lib/go-svc/go-svc-client.types";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
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

/** go-svc answers with these when it cannot write the file it was given. */
const RENDER_REJECTED_STATUSES: ReadonlySet<number> = new Set([400, 413, 422]);

export type ProjectSourceFormatTranslationDownload = {
  content: Uint8Array;
  contentType: string;
};

export type ProjectSourceFormatTranslationDownloadError =
  | { code: "translation_keys_not_found" }
  | { code: "source_content_not_found" }
  | { code: "render_rejected" }
  | { code: "render_unavailable" };

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

async function renderWithGoSvc(body: RenderTranslationFileBody): Promise<Uint8Array> {
  const rendered = await createGoSvcServerClient().translationFile.render(body, {
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });
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
}): Promise<
  Result<ProjectSourceFormatTranslationDownload | null, ProjectSourceFormatTranslationDownloadError>
> {
  if (!isWrittenInSourceFormat(input.sourcePath)) {
    return ok(null);
  }

  const translations = await loadProjectTranslationsAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    readyTranslationsOnly: true,
  });
  if (translations.loadedKeyCount === 0) {
    return err({ code: "translation_keys_not_found" });
  }

  // The keys were extracted from the reconciled version, so that version is the template.
  const sourceFile = await findLatestReconciledVersionForFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
  if (!sourceFile?.reconciledSourceFileVersionId) {
    return err({ code: "source_content_not_found" });
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
    return err({ code: "source_content_not_found" });
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
    return err({ code: "source_content_not_found" });
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
    renderWithGoSvc({
      sourcePath: input.sourcePath,
      sourceLocale: project?.sourceLocale ?? "",
      targetLocale: input.targetLocale,
      source: source.value.content.toString("base64"),
      values: translations.prefilled,
      sourceSpans,
    }),
  );
  if (isErr(rendered)) {
    const status = rendered.error instanceof GoSvcClientError ? rendered.error.status : null;
    return err({
      code:
        status !== null && RENDER_REJECTED_STATUSES.has(status)
          ? "render_rejected"
          : "render_unavailable",
    });
  }

  return ok({
    content: rendered.value,
    contentType: source.value.file.contentType || "application/octet-stream",
  });
}
