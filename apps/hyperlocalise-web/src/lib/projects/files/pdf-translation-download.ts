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
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { inferSupportedPdfTranslationFileFormat } from "@/lib/translation/file-formats";

export const PDF_CONTENT_TYPE = "application/pdf";

export type ProjectPdfTranslationDownload = {
  content: Buffer;
  contentType: typeof PDF_CONTENT_TYPE;
  extension: ".pdf";
  translatedKeyCount: number;
  overflowKeys: readonly string[];
};

export type ProjectPdfTranslationDownloadError =
  | { code: "project_not_found" }
  | { code: "source_content_not_found" }
  | { code: "pdf_export_failed"; message: string };

/** Error code and message for a failed PDF download. */
export function pdfTranslationDownloadFailure(): {
  code: "pdf_export_failed";
  message: string;
} {
  return {
    code: "pdf_export_failed",
    message: "Could not write translations into the PDF.",
  };
}

/**
 * Builds the target-locale copy of a segmented PDF from ready translations.
 * Resolves to `null` when the path is not a PDF or the file has no keys.
 */
export async function loadProjectPdfTranslationDownload(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  approvedTranslationsOnly?: boolean;
}): Promise<Result<ProjectPdfTranslationDownload | null, ProjectPdfTranslationDownloadError>> {
  const format = inferSupportedPdfTranslationFileFormat(input.sourcePath);
  if (!format) {
    return ok(null);
  }

  const translations = await loadProjectTranslationsAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    readyTranslationsOnly: true,
    approvedTranslationsOnly: input.approvedTranslationsOnly,
  });
  if (translations.loadedKeyCount === 0) {
    return ok(null);
  }

  const version = await getLatestRepositorySourceFileVersion({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
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

  try {
    const applied = await createGoSvcServerClient().pdf.apply({
      template: stored.value.content,
      values: translations.prefilled,
      targetLocale: input.targetLocale,
    });
    return ok({
      content: Buffer.from(applied.content),
      contentType: PDF_CONTENT_TYPE,
      extension: ".pdf",
      translatedKeyCount: translations.translatedKeyCount,
      overflowKeys: applied.overflowKeys,
    });
  } catch (error) {
    const message =
      error instanceof GoSvcClientError && error.message
        ? error.message
        : pdfTranslationDownloadFailure().message;
    return err({ code: "pdf_export_failed", message });
  }
}
