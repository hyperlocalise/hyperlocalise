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
};

export const supportedImageTranslationFileFormats = ["png", "jpeg", "webp"] as const;

export type SupportedImageTranslationFileFormat =
  (typeof supportedImageTranslationFileFormats)[number];

export function isImageTranslationFileFormat(
  format: SupportedTranslationFileFormat,
): format is SupportedImageTranslationFileFormat {
  return supportedImageTranslationFileFormats.includes(
    format as SupportedImageTranslationFileFormat,
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

/** Text or image formats accepted as project source uploads (sync, chat, public API). */
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

const IMAGE_URL_EXTENSION_PATTERN = /\.(png|jpe?g|webp)(?:[?#]|$)/i;

/** Heuristic: http(s) URL that looks like an image asset. */
export function looksLikeImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return IMAGE_URL_EXTENSION_PATTERN.test(url.pathname);
  } catch {
    return false;
  }
}

/** File extensions scanned by the i18n setup wizard (without leading dot). */
export function getLocaleScanExtensions(): string[] {
  const extensions = new Set<string>();

  for (const [extension, format] of Object.entries(formatsByExtension)) {
    if (isSupportedFileTranslationFileFormat(format)) {
      extensions.add(extension.slice(1));
    }
  }

  return [...extensions].toSorted();
}
