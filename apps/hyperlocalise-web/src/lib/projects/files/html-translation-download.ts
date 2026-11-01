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
import { applyHtmlIngestTranslations } from "@/lib/projects/files/html-ingest-entries";
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

export const HTML_CONTENT_TYPE = "text/html";

export type ProjectHtmlTranslationDownload = {
  content: Buffer;
  contentType: typeof HTML_CONTENT_TYPE;
  extension: ".html" | ".htm";
  translatedKeyCount: number;
};

export type ProjectHtmlTranslationDownloadError =
  | { code: "source_content_not_found" }
  | { code: "html_export_failed"; message: string };

/** Same-origin URL of the generated file, used as the File view target. */
export function projectHtmlTranslationDownloadPath(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
}) {
  const params = new URLSearchParams({ sourcePath: input.sourcePath, locale: input.targetLocale });
  return `/api/orgs/${encodeURIComponent(input.organizationSlug)}/projects/${encodeURIComponent(input.projectId)}/files/translations/download?${params.toString()}`;
}

/** Error code and message for a failed HTML download. */
export function htmlTranslationDownloadFailure(): {
  code: "html_export_failed";
  message: string;
} {
  return {
    code: "html_export_failed",
    message: "Could not write translations into the HTML file.",
  };
}

/**
 * Builds the target-locale copy of an HTML source from its ready translations.
 * Missing keys keep their source text. Resolves to `null` when the path is not
 * an HTML file so callers keep their stored-file or JSON download.
 */
export async function loadProjectHtmlTranslationDownload(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  approvedTranslationsOnly?: boolean;
}): Promise<Result<ProjectHtmlTranslationDownload | null, ProjectHtmlTranslationDownloadError>> {
  if (inferSupportedTranslationFileFormat(input.sourcePath) !== "html") {
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

  const extension = input.sourcePath.toLowerCase().endsWith(".htm") ? ".htm" : ".html";
  try {
    const template = Buffer.from(stored.value.content).toString("utf-8");
    const content = applyHtmlIngestTranslations(template, translations.prefilled);
    return ok({
      content: Buffer.from(content, "utf-8"),
      contentType: HTML_CONTENT_TYPE,
      extension,
      translatedKeyCount: translations.translatedKeyCount,
    });
  } catch {
    const failure = htmlTranslationDownloadFailure();
    return err({ code: failure.code, message: failure.message });
  }
}
