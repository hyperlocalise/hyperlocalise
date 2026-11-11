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
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  marshalSubtitles,
  resolveSubtitleKind,
  subtitleExportContentType,
  type SubtitleTranslationExport,
} from "@/lib/translation/subtitles/subtitle-writer";

export type ProjectSubtitleTranslationDownloadError =
  | { code: "source_content_not_found" }
  | { code: "subtitle_export_failed"; message: string };

export async function loadProjectSubtitleTranslationDownload(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  prefilled: Readonly<Record<string, string>>;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<Result<SubtitleTranslationExport | null, ProjectSubtitleTranslationDownloadError>> {
  const kind = resolveSubtitleKind(input.sourcePath);
  if (!kind) {
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
      adapter: input.fileStorageAdapter,
    }),
  );
  if (isErr(stored)) {
    return err({ code: "source_content_not_found" });
  }

  const marshaled = marshalSubtitles(stored.value.content, input.prefilled, kind);
  if (isErr(marshaled)) {
    return err({ code: "subtitle_export_failed", message: marshaled.error.message });
  }

  return ok({
    content: marshaled.value,
    contentType: subtitleExportContentType(kind),
    extension: kind === "vtt" ? ".vtt" : kind === "sbv" ? ".sbv" : ".srt",
  });
}
