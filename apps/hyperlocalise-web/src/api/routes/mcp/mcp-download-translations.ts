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

import { loadProjectLottieTranslationDownload } from "@/lib/projects/files/lottie-translation-download";
import { isErr } from "@/lib/primitives/result/results";
import {
  getRepositorySourceFileByPath,
  loadProjectTranslationsAsPrefilledEntries,
} from "@/lib/projects/translations/project-translation-service";
import {
  inferSupportedTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";
import { DOTLOTTIE_CONTENT_TYPE } from "@/lib/translation/lottie/lottie-translation-export";

export type McpDownloadTranslationsDetail = {
  filename: string;
  contentType: string;
  locale: string;
  sourcePath: string;
  content: string;
  /** Present when `content` holds base64-encoded binary (dotLottie archives). */
  contentEncoding?: "utf8" | "base64";
};

export type McpDownloadTranslationsResult =
  | {
      ok: true;
      value: McpDownloadTranslationsDetail;
    }
  | {
      ok: false;
      error:
        | "source_file_not_found"
        | "translations_not_found"
        | "unsupported_binary_download"
        | "lottie_export_failed";
    }
  | {
      ok: false;
      error: "source_file_too_large";
      maxKeyCount: number;
    };

const MCP_UTF8_DOWNLOAD_FORMATS = new Set<SupportedTranslationFileFormat>([
  "json",
  "jsonc",
  "arb",
  "lottie",
]);

function isMcpTranslationDownloadFormat(
  format: SupportedTranslationFileFormat | null,
): format is SupportedTranslationFileFormat {
  return format !== null && MCP_UTF8_DOWNLOAD_FORMATS.has(format);
}

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
  if (!isMcpTranslationDownloadFormat(sourceFormat)) {
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

  const lottieDownload = await loadProjectLottieTranslationDownload({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    prefilled: result.prefilled,
  });
  if (isErr(lottieDownload)) {
    return { ok: false, error: "lottie_export_failed" };
  }

  if (lottieDownload.value?.kind === "dotlottie") {
    return {
      ok: true,
      value: {
        filename: downloadFilename(input.sourcePath, input.locale),
        contentType: DOTLOTTIE_CONTENT_TYPE,
        locale: input.locale,
        sourcePath: input.sourcePath,
        contentEncoding: "base64",
        content: lottieDownload.value.content.toString("base64"),
      },
    };
  }

  return {
    ok: true,
    value: {
      filename: downloadFilename(input.sourcePath, input.locale),
      contentType: lottieDownload.value?.contentType ?? "application/json; charset=utf-8",
      locale: input.locale,
      sourcePath: input.sourcePath,
      contentEncoding: "utf8",
      content: lottieDownload.value
        ? lottieDownload.value.content.toString("utf8")
        : `${JSON.stringify(result.prefilled, null, 2)}\n`,
    },
  };
}
