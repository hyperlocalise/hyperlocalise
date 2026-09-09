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
import path from "node:path";

import {
  getRepositorySourceFileByPath,
  loadProjectTranslationsAsPrefilledEntries,
} from "@/lib/projects/translations/project-translation-service";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

export type McpDownloadTranslationsDetail = {
  filename: string;
  contentType: string;
  locale: string;
  sourcePath: string;
  content: string;
};

export type McpDownloadTranslationsResult =
  | {
      ok: true;
      value: McpDownloadTranslationsDetail;
    }
  | {
      ok: false;
      error: "source_file_not_found" | "translations_not_found" | "unsupported_binary_download";
    }
  | {
      ok: false;
      error: "source_file_too_large";
      maxKeyCount: number;
    };

/** Builds the target filename used by the public translation download endpoint. */
function downloadFilename(sourcePath: string, locale: string) {
  const extension = path.extname(sourcePath);
  const baseName = path.basename(sourcePath, extension);
  const suffix = baseName.endsWith(`-${locale}`) ? baseName : `${baseName}-${locale}`;

  return extension ? `${suffix}${extension}` : `${suffix}.json`;
}

export async function downloadMcpTranslations(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  locale: string;
}): Promise<McpDownloadTranslationsResult> {
  const sourceFile = await getRepositorySourceFileByPath({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });

  if (!sourceFile) {
    return {
      ok: false,
      error: "source_file_not_found",
    };
  }

  const sourceFormat = inferSupportedTranslationFileFormat(input.sourcePath);
  if (sourceFormat !== "json" && sourceFormat !== "jsonc" && sourceFormat !== "arb") {
    return {
      ok: false,
      error: "unsupported_binary_download",
    };
  }

  const result = await loadProjectTranslationsAsPrefilledEntries({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.locale,
    includeAllSourceKeys: true,
  });

  if (result.truncated) {
    return {
      ok: false,
      error: "source_file_too_large",
      maxKeyCount: result.maxKeyCount,
    };
  }

  if (result.loadedKeyCount === 0) {
    return {
      ok: false,
      error: "translations_not_found",
    };
  }

  return {
    ok: true,
    value: {
      filename: downloadFilename(input.sourcePath, input.locale),
      contentType: "application/json; charset=utf-8",
      locale: input.locale,
      sourcePath: input.sourcePath,
      content: `${JSON.stringify(result.prefilled, null, 2)}\n`,
    },
  };
}
