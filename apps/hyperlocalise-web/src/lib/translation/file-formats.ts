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
export const supportedTranslationFileFormats = [
  "json",
  "jsonc",
  "yaml",
  "arb",
  "xliff",
  "po",
  "html",
  "markdown",
  "mdx",
  "strings",
  "stringsdict",
  "xcstrings",
  "csv",
  "png",
  "jpeg",
  "webp",
  "mp4",
  "docx",
  "xlsx",
  "xls",
  "pptx",
] as const;

export type SupportedTranslationFileFormat = (typeof supportedTranslationFileFormats)[number];

export const supportedFileTranslationFileFormats = [
  "json",
  "jsonc",
  "yaml",
  "arb",
  "xliff",
  "po",
  "html",
  "markdown",
  "mdx",
  "strings",
  "stringsdict",
  "xcstrings",
  "csv",
  "png",
  "jpeg",
  "webp",
  "mp4",
] as const;

export type SupportedFileTranslationFileFormat =
  (typeof supportedFileTranslationFileFormats)[number];

const formatsByExtension: Record<string, SupportedTranslationFileFormat> = {
  ".json": "json",
  ".jsonc": "jsonc",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".arb": "arb",
  ".xlf": "xliff",
  ".xlif": "xliff",
  ".xliff": "xliff",
  ".po": "po",
  ".html": "html",
  ".md": "markdown",
  ".mdx": "mdx",
  ".strings": "strings",
  ".stringsdict": "stringsdict",
  ".xcstrings": "xcstrings",
  ".csv": "csv",
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".webp": "webp",
  ".mp4": "mp4",
  ".docx": "docx",
  ".xlsx": "xlsx",
  ".xls": "xls",
  ".pptx": "pptx",
};

export const supportedImageTranslationFileFormats = ["png", "jpeg", "webp"] as const;

export type SupportedImageTranslationFileFormat =
  (typeof supportedImageTranslationFileFormats)[number];

export const supportedVideoTranslationFileFormats = ["mp4"] as const;

export type SupportedVideoTranslationFileFormat =
  (typeof supportedVideoTranslationFileFormats)[number];

export const supportedOfficeTranslationFileFormats = ["docx", "xlsx", "xls", "pptx"] as const;

export type SupportedOfficeTranslationFileFormat =
  (typeof supportedOfficeTranslationFileFormats)[number];

export function isImageTranslationFileFormat(
  format: SupportedTranslationFileFormat,
): format is SupportedImageTranslationFileFormat {
  return supportedImageTranslationFileFormats.includes(
    format as SupportedImageTranslationFileFormat,
  );
}

export function isVideoTranslationFileFormat(
  format: SupportedTranslationFileFormat,
): format is SupportedVideoTranslationFileFormat {
  return supportedVideoTranslationFileFormats.includes(
    format as SupportedVideoTranslationFileFormat,
  );
}

export function isOfficeTranslationFileFormat(
  format: SupportedTranslationFileFormat,
): format is SupportedOfficeTranslationFileFormat {
  return supportedOfficeTranslationFileFormats.includes(
    format as SupportedOfficeTranslationFileFormat,
  );
}

/** Binary whole-file formats that skip string-key extraction (images + video + office). */
export function isBinaryTranslationFileFormat(
  format: SupportedTranslationFileFormat,
): format is
  | SupportedImageTranslationFileFormat
  | SupportedVideoTranslationFileFormat
  | SupportedOfficeTranslationFileFormat {
  return (
    isImageTranslationFileFormat(format) ||
    isVideoTranslationFileFormat(format) ||
    isOfficeTranslationFileFormat(format)
  );
}

export function isSupportedFileTranslationFileFormat(
  format: SupportedTranslationFileFormat,
): format is SupportedFileTranslationFileFormat {
  return supportedFileTranslationFileFormats.includes(format as SupportedFileTranslationFileFormat);
}

export function inferSupportedTranslationFileFormat(
  filename: string,
): SupportedTranslationFileFormat | null {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) {
    return null;
  }

  return formatsByExtension[filename.slice(dotIndex).toLowerCase()] ?? null;
}

export function inferSupportedFileTranslationFileFormat(
  filename: string,
): SupportedFileTranslationFileFormat | null {
  const format = inferSupportedTranslationFileFormat(filename);
  if (!format || !isSupportedFileTranslationFileFormat(format)) {
    return null;
  }

  return format;
}

/** Text, image, video, or office formats accepted as project source uploads (sync, chat, public API). */
export function inferSupportedSourceUploadFormat(
  filename: string,
): SupportedTranslationFileFormat | null {
  return inferSupportedTranslationFileFormat(filename);
}

export function isSupportedSourceUploadFormat(filename: string): boolean {
  return inferSupportedSourceUploadFormat(filename) !== null;
}

export function inferSupportedImageTranslationFileFormat(
  filename: string,
): SupportedImageTranslationFileFormat | null {
  const format = inferSupportedTranslationFileFormat(filename);
  if (!format || !isImageTranslationFileFormat(format)) {
    return null;
  }

  return format;
}

export function inferSupportedVideoTranslationFileFormat(
  filename: string,
): SupportedVideoTranslationFileFormat | null {
  const format = inferSupportedTranslationFileFormat(filename);
  if (!format || !isVideoTranslationFileFormat(format)) {
    return null;
  }

  return format;
}

export function inferSupportedOfficeTranslationFileFormat(
  filename: string,
): SupportedOfficeTranslationFileFormat | null {
  const format = inferSupportedTranslationFileFormat(filename);
  if (!format || !isOfficeTranslationFileFormat(format)) {
    return null;
  }

  return format;
}

export function inferSupportedBinaryTranslationFileFormat(
  filename: string,
):
  | SupportedImageTranslationFileFormat
  | SupportedVideoTranslationFileFormat
  | SupportedOfficeTranslationFileFormat
  | null {
  const format = inferSupportedTranslationFileFormat(filename);
  if (!format || !isBinaryTranslationFileFormat(format)) {
    return null;
  }

  return format;
}

const IMAGE_URL_EXTENSION_PATTERN = /\.(png|jpe?g|webp)(?:[?#]|$)/i;
const VIDEO_URL_EXTENSION_PATTERN = /\.mp4(?:[?#]|$)/i;

function looksLikeHttpAssetUrl(value: string, extensionPattern: RegExp): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return extensionPattern.test(url.pathname);
  } catch {
    return false;
  }
}

/** Heuristic: http(s) URL that looks like an image asset. */
export function looksLikeImageUrl(value: string): boolean {
  return looksLikeHttpAssetUrl(value, IMAGE_URL_EXTENSION_PATTERN);
}

/** Heuristic: http(s) URL that looks like a direct MP4 asset. */
export function looksLikeVideoUrl(value: string): boolean {
  return looksLikeHttpAssetUrl(value, VIDEO_URL_EXTENSION_PATTERN);
}

/** File extensions scanned by the i18n setup wizard (without leading dot). */
export function getLocaleScanExtensions(): string[] {
  const extensions = new Set<string>();

  for (const [extension, format] of Object.entries(formatsByExtension)) {
    if (isSupportedFileTranslationFileFormat(format) && !isBinaryTranslationFileFormat(format)) {
      extensions.add(extension.slice(1));
    }
  }

  return [...extensions].toSorted();
}

/** Comma-separated `accept` value for project source upload file pickers. */
export function getSupportedSourceUploadAccept(): string {
  return Object.keys(formatsByExtension).toSorted().join(",");
}
