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
import { getProjectSourceLocale } from "@/lib/projects/files/office-source-entries";
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import {
  inferSupportedOfficeTranslationFileFormat,
  inferSupportedPdfTranslationFileFormat,
  type SupportedOfficeTranslationFileFormat,
  type SupportedPdfTranslationFileFormat,
} from "@/lib/translation/file-formats";
import { applyDocxTranslations, DOCX_CONTENT_TYPE } from "@/lib/translation/ooxml/docx-document";
import type { OoxmlError } from "@/lib/translation/ooxml/ooxml-tree";
import { applyPptxTranslations, PPTX_CONTENT_TYPE } from "@/lib/translation/ooxml/pptx-deck";
import { spreadsheetXlsxContent } from "@/lib/translation/xlsx/xls-workbook";
import { XLSX_CONTENT_TYPE, type XlsxWorkbookError } from "@/lib/translation/xlsx/xlsx-workbook";
import { applyXlsxTranslations } from "@/lib/translation/xlsx/xlsx-writer";

export const PDF_CONTENT_TYPE = "application/pdf";

export type ProjectOfficeTranslationDownload = {
  content: Buffer;
  contentType:
    | typeof XLSX_CONTENT_TYPE
    | typeof DOCX_CONTENT_TYPE
    | typeof PPTX_CONTENT_TYPE
    | typeof PDF_CONTENT_TYPE;
  /** `.xls` sources are generated as `.xlsx`; other formats keep their extension. */
  extension: ".xlsx" | ".docx" | ".pptx" | ".pdf";
  translatedKeyCount: number;
  overflowKeys?: string[];
};

export type ProjectOfficeTranslationDownloadError =
  | XlsxWorkbookError
  | OoxmlError
  | { code: "project_not_found" }
  | { code: "source_content_not_found" };

/** Same-origin URL of the generated file, used as the File view target. */
export function projectOfficeTranslationDownloadPath(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
}) {
  const params = new URLSearchParams({ sourcePath: input.sourcePath, locale: input.targetLocale });
  return `/api/orgs/${encodeURIComponent(input.organizationSlug)}/projects/${encodeURIComponent(input.projectId)}/files/translations/download?${params.toString()}`;
}

/**
 * Download filename for the `targetLocale` copy of `sourcePath`, swapping `.xls` for the
 * `.xlsx` the download is generated as.
 */
export function officeTranslationDownloadFilename(
  filename: string,
  download: Pick<ProjectOfficeTranslationDownload, "extension">,
): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot > filename.lastIndexOf("/") ? filename.slice(0, dot) : filename;
  return `${stem}${download.extension}`;
}

/** Error code and message for a failed Office download, kept per format for API callers. */
export function officeTranslationDownloadFailure(sourcePath: string): {
  code: "xlsx_export_failed" | "office_export_failed" | "pdf_export_failed";
  message: string;
} {
  if (inferSupportedPdfTranslationFileFormat(sourcePath)) {
    return {
      code: "pdf_export_failed",
      message: "Could not write translations into the PDF.",
    };
  }
  const format = inferSupportedOfficeTranslationFileFormat(sourcePath);
  return format === "xlsx" || format === "xls"
    ? {
        code: "xlsx_export_failed",
        message: "Could not write translations into the Excel workbook.",
      }
    : {
        code: "office_export_failed",
        message: "Could not write translations into the Office file.",
      };
}

type SegmentedBinaryDownloadFormat =
  | SupportedOfficeTranslationFileFormat
  | SupportedPdfTranslationFileFormat;

async function applyOfficeTranslations(input: {
  format: SegmentedBinaryDownloadFormat;
  template: Uint8Array;
  values: Readonly<Record<string, string>>;
  sourceLocale: string | null;
  targetLocale: string;
}): Promise<
  Result<
    Omit<ProjectOfficeTranslationDownload, "translatedKeyCount">,
    ProjectOfficeTranslationDownloadError
  >
> {
  switch (input.format) {
    case "xlsx":
    case "xls": {
      const template = spreadsheetXlsxContent(input.template);
      if (isErr(template)) {
        return template;
      }
      const content = await applyXlsxTranslations({ ...input, template: template.value });
      return isErr(content)
        ? content
        : ok({ content: content.value, contentType: XLSX_CONTENT_TYPE, extension: ".xlsx" });
    }
    case "docx": {
      const content = await applyDocxTranslations(input.template, input.values);
      return isErr(content)
        ? content
        : ok({
            content: Buffer.from(content.value),
            contentType: DOCX_CONTENT_TYPE,
            extension: ".docx",
          });
    }
    case "pptx": {
      const content = await applyPptxTranslations(input.template, input.values);
      return isErr(content)
        ? content
        : ok({
            content: Buffer.from(content.value),
            contentType: PPTX_CONTENT_TYPE,
            extension: ".pptx",
          });
    }
    case "pdf": {
      const client = createGoSvcServerClient();
      const applied = await fromThrowableAsync(
        client.pdf.applyTranslations({
          template: input.template,
          values: input.values,
          targetLocale: input.targetLocale,
        }),
      );
      if (isErr(applied)) {
        return err({ code: "source_content_not_found" });
      }
      return ok({
        content: applied.value.content,
        contentType: PDF_CONTENT_TYPE,
        extension: ".pdf",
        overflowKeys: applied.value.overflowKeys,
      });
    }
  }
}

/**
 * Builds the `targetLocale` copy of a segmented Office source from its ready translations.
 * Source text is never written into multilingual target cells, and their cells without a
 * ready value are cleared. Cell-layout sheets, document paragraphs, and slide paragraphs
 * keep their source text where no translation is supplied.
 *
 * Resolves to `null` when the path is not an Office file or the file has no keys (legacy
 * uploads), so callers keep their stored-file download.
 */
export async function loadProjectOfficeTranslationDownload(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  approvedTranslationsOnly?: boolean;
}): Promise<
  Result<ProjectOfficeTranslationDownload | null, ProjectOfficeTranslationDownloadError>
> {
  const format =
    inferSupportedOfficeTranslationFileFormat(input.sourcePath) ??
    inferSupportedPdfTranslationFileFormat(input.sourcePath);
  if (!format) {
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

  const generated = await applyOfficeTranslations({
    format,
    template: stored.value.content,
    values: translations.prefilled,
    sourceLocale: sourceLocale.value,
    targetLocale: input.targetLocale,
  });
  if (isErr(generated)) {
    return generated;
  }
  return ok({ ...generated.value, translatedKeyCount: translations.translatedKeyCount });
}
