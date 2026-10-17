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
import {
  getLatestRepositorySourceFileVersion,
  getStoredFileContent,
} from "@/lib/file-storage/records";
import { getProjectSourceLocale } from "@/lib/projects/files/xlsx-source-entries";
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { inferSupportedSegmentedSpreadsheetTranslationFileFormat } from "@/lib/translation/file-formats";
import { XLSX_CONTENT_TYPE, type XlsxWorkbookError } from "@/lib/translation/xlsx/xlsx-workbook";
import { applyXlsxTranslations } from "@/lib/translation/xlsx/xlsx-writer";

export type ProjectXlsxTranslationDownload = {
  content: Buffer;
  contentType: typeof XLSX_CONTENT_TYPE;
  translatedKeyCount: number;
};

export type ProjectXlsxTranslationDownloadError =
  | XlsxWorkbookError
  | { code: "project_not_found" }
  | { code: "source_content_not_found" };

/**
 * Builds the `targetLocale` copy of a segmented `.xlsx` source from its ready translations.
 * Source text is never written into target cells, so untranslated rows stay empty in
 * multilingual sheets and keep their source text in cell-layout sheets.
 *
 * Resolves to `null` when the path is not a segmented workbook or the file has no keys
 * (legacy Office uploads), so callers keep their stored-file download.
 */
export async function loadProjectXlsxTranslationDownload(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  approvedTranslationsOnly?: boolean;
}): Promise<Result<ProjectXlsxTranslationDownload | null, ProjectXlsxTranslationDownloadError>> {
  if (!inferSupportedSegmentedSpreadsheetTranslationFileFormat(input.sourcePath)) {
    return ok(null);
  }

  const [translations, version, sourceLocale] = await Promise.all([
    loadProjectTranslationsAsPrefilledEntries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: input.targetLocale,
      readyTranslationsOnly: true,
      approvedTranslationsOnly: input.approvedTranslationsOnly,
    }),
    getLatestRepositorySourceFileVersion({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
    }),
    getProjectSourceLocale(input),
  ]);
  if (translations.loadedKeyCount === 0) {
    return ok(null);
  }
  if (isErr(sourceLocale)) {
    return sourceLocale;
  }
  if (!version) {
    return err({ code: "source_content_not_found" });
  }

  const stored = await fromThrowableAsync(
    getStoredFileContent({
      organizationId: input.organizationId,
      projectId: input.projectId,
      fileId: version.storedFileId,
    }),
  );
  if (isErr(stored)) {
    return err({ code: "source_content_not_found" });
  }

  const content = await applyXlsxTranslations({
    template: stored.value.content,
    values: translations.prefilled,
    sourceLocale: sourceLocale.value,
    targetLocale: input.targetLocale,
  });
  if (isErr(content)) {
    return content;
  }
  return ok({
    content: content.value,
    contentType: XLSX_CONTENT_TYPE,
    translatedKeyCount: translations.translatedKeyCount,
  });
}
