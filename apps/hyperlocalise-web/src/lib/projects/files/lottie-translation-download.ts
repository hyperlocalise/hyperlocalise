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
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import {
  buildLottieTranslationExport,
  resolveLottieSourceKind,
  type LottieTranslationExport,
  type LottieTranslationExportError,
} from "@/lib/translation/lottie/lottie-translation-export";

export type ProjectLottieTranslationDownloadError =
  | LottieTranslationExportError
  | { code: "source_content_not_found" };

/**
 * Writes translations back into the stored Lottie source. Resolves to `null` when the
 * source is not a Lottie animation so callers keep their key/value JSON export.
 */
export async function loadProjectLottieTranslationDownload(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  prefilled: Readonly<Record<string, string>>;
}): Promise<Result<LottieTranslationExport | null, ProjectLottieTranslationDownloadError>> {
  const kind = resolveLottieSourceKind(input.sourcePath, Object.keys(input.prefilled));
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
    }),
  );
  if (isErr(stored)) {
    return err({ code: "source_content_not_found" });
  }

  return buildLottieTranslationExport({
    kind,
    sourceContent: stored.value.content,
    values: input.prefilled,
  });
}
