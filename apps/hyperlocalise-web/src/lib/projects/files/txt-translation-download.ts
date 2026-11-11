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

export const TXT_CONTENT_TYPE = "text/plain; charset=utf-8";

export type ProjectTxtTranslationDownload = {
  content: Buffer;
  contentType: typeof TXT_CONTENT_TYPE;
  extension: ".txt";
  translatedKeyCount: number;
};

export type ProjectTxtTranslationDownloadError =
  | { code: "source_content_not_found" }
  | { code: "plaintext_export_failed"; message: string };

/** Error code and message for a failed TXT download. */
export function txtTranslationDownloadFailure(): {
  code: "plaintext_export_failed";
  message: string;
} {
  return {
    code: "plaintext_export_failed",
    message: "Could not write translations into the text file.",
  };
}

/**
 * Builds the target-locale copy of a TXT source from ready translations,
 * rendered through the source template so layout and untranslated paragraphs
 * fall back to the source text. Resolves to `null` when the file has no keys.
 */
export async function loadProjectTxtTranslationDownload(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  approvedTranslationsOnly?: boolean;
}): Promise<Result<ProjectTxtTranslationDownload | null, ProjectTxtTranslationDownloadError>> {
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
    const applied = await createGoSvcServerClient().plaintext.apply({
      template: stored.value.content,
      values: translations.prefilled,
      targetLocale: input.targetLocale,
    });
    return ok({
      content: Buffer.from(applied.content),
      contentType: TXT_CONTENT_TYPE,
      extension: ".txt",
      translatedKeyCount: translations.translatedKeyCount,
    });
  } catch (error) {
    const message =
      error instanceof GoSvcClientError && error.message
        ? error.message
        : txtTranslationDownloadFailure().message;
    return err({ code: "plaintext_export_failed", message });
  }
}
