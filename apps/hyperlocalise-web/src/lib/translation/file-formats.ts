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
