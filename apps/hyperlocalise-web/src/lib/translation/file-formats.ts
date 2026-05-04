export const supportedTranslationFileFormats = [
  "json",
  "jsonc",
  "arb",
  "xliff",
  "po",
  "html",
  "markdown",
  "mdx",
  "strings",
  "stringsdict",
  "csv",
  "png",
  "jpeg",
  "webp",
] as const;

export type SupportedTranslationFileFormat = (typeof supportedTranslationFileFormats)[number];

const formatsByExtension: Record<string, SupportedTranslationFileFormat> = {
  ".json": "json",
  ".jsonc": "jsonc",
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

export function inferSupportedTranslationFileFormat(
  filename: string,
): SupportedTranslationFileFormat | null {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) {
    return null;
  }

  return formatsByExtension[filename.slice(dotIndex).toLowerCase()] ?? null;
}
