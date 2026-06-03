import { inferSupportedFileTranslationFileFormat } from "@/lib/translation/file-formats";

export type DetectedLocaleFile = {
  path: string;
  locale: string;
  format: string;
};

export type LocaleFileGroup = {
  id: string;
  files: DetectedLocaleFile[];
  pathPattern: {
    from: string;
    to: string;
  };
};

export type LocaleDetectionResult = {
  sourceLocale: string;
  targetLocales: string[];
  groups: LocaleFileGroup[];
  allFiles: DetectedLocaleFile[];
};

const LOCALE_TOKEN = /^([a-z]{2,3}(?:-[A-Z]{2})?(?:-[A-Za-z0-9]+)*|[a-z]{2}_[A-Z]{2})$/;

const SOURCE_LOCALE_PREFERENCE = ["en-US", "en-GB", "en", "en_US"];

const IGNORED_PATH_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "vendor/",
  "coverage/",
  ".hyperlocalise/",
];

export function isIgnoredLocaleScanPath(path: string): boolean {
  const normalized = path.replace(/^\.\//, "");
  return IGNORED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function extractLocaleFromPath(path: string): string | null {
  const normalized = path.replace(/^\.\//, "");
  if (isIgnoredLocaleScanPath(normalized)) {
    return null;
  }

  if (!inferSupportedFileTranslationFileFormat(normalized)) {
    return null;
  }

  const segments = normalized.split("/");
  const fileName = segments.at(-1) ?? normalized;
  const stem = fileName.replace(/\.[^.]+$/, "");

  if (LOCALE_TOKEN.test(stem)) {
    return normalizeLocaleToken(stem);
  }

  if (segments.length >= 2) {
    const parent = segments.at(-2) ?? "";
    if (LOCALE_TOKEN.test(parent)) {
      return normalizeLocaleToken(parent);
    }
  }

  const bracketMatch = normalized.match(/\[locale\]/i);
  if (bracketMatch) {
    return null;
  }

  const percentMatch = normalized.match(/%locale%/i);
  if (percentMatch) {
    return null;
  }

  return null;
}

export function normalizeLocaleToken(token: string): string {
  return token.replaceAll("_", "-");
}

export function detectLocaleFiles(paths: string[]): LocaleDetectionResult | null {
  const allFiles: DetectedLocaleFile[] = [];

  for (const path of paths) {
    const locale = extractLocaleFromPath(path);
    if (!locale) {
      continue;
    }

    const format = inferSupportedFileTranslationFileFormat(path);
    if (!format) {
      continue;
    }

    allFiles.push({ path, locale, format });
  }

  if (allFiles.length === 0) {
    return null;
  }

  const localeCounts = new Map<string, number>();
  for (const file of allFiles) {
    localeCounts.set(file.locale, (localeCounts.get(file.locale) ?? 0) + 1);
  }

  const sourceLocale = pickSourceLocale([...localeCounts.keys()]);
  const targetLocales = [...localeCounts.keys()]
    .filter((locale) => locale !== sourceLocale)
    .toSorted();

  const groups = buildLocaleFileGroups(allFiles, sourceLocale);

  return {
    sourceLocale,
    targetLocales,
    groups,
    allFiles,
  };
}

function pickSourceLocale(locales: string[]): string {
  for (const preferred of SOURCE_LOCALE_PREFERENCE) {
    if (locales.includes(preferred)) {
      return preferred;
    }
  }

  return locales.toSorted((a, b) => a.localeCompare(b))[0] ?? "en-US";
}

function buildLocaleFileGroups(
  files: DetectedLocaleFile[],
  sourceLocale: string,
): LocaleFileGroup[] {
  const byPattern = new Map<string, DetectedLocaleFile[]>();

  for (const file of files) {
    const patternKey = buildPatternKey(file.path, file.locale);
    const bucket = byPattern.get(patternKey) ?? [];
    bucket.push(file);
    byPattern.set(patternKey, bucket);
  }

  const groups: LocaleFileGroup[] = [];

  for (const [patternKey, groupFiles] of byPattern.entries()) {
    const localesInGroup = new Set(groupFiles.map((file) => file.locale));
    if (!localesInGroup.has(sourceLocale) || groupFiles.length < 2) {
      continue;
    }

    const sample = groupFiles.find((file) => file.locale === sourceLocale) ?? groupFiles[0];
    if (!sample) {
      continue;
    }

    const pathPattern = buildPathPattern(sample.path, sample.locale);
    groups.push({
      id: sanitizeBucketName(patternKey),
      files: groupFiles,
      pathPattern,
    });
  }

  return groups.toSorted((a, b) => a.id.localeCompare(b.id));
}

function buildPatternKey(path: string, locale: string): string {
  const normalized = path.replace(/^\.\//, "");
  const segments = normalized.split("/");
  const fileName = segments.at(-1) ?? normalized;

  if (fileName.startsWith(`${locale}.`)) {
    return segments.slice(0, -1).join("/") || "root";
  }

  const localeParent = segments.slice(0, -2).join("/") || "root";
  return `${localeParent}/${fileName}`;
}

function buildPathPattern(path: string, locale: string): { from: string; to: string } {
  const normalized = path.replace(/^\.\//, "");
  const segments = normalized.split("/");
  const fileName = segments.at(-1) ?? normalized;

  if (fileName.startsWith(`${locale}.`)) {
    const extension = fileName.slice(locale.length);
    const directory = segments.slice(0, -1).join("/");
    const prefix = directory ? `${directory}/` : "";
    return {
      from: `${prefix}{{source}}${extension}`,
      to: `${prefix}{{target}}${extension}`,
    };
  }

  const directoryParts = segments.slice(0, -1);
  const localeIndex = directoryParts.lastIndexOf(locale);
  const baseParts = directoryParts.slice(0, localeIndex);
  const prefix = baseParts.length > 0 ? `${baseParts.join("/")}/` : "";

  return {
    from: `${prefix}{{source}}/${fileName}`,
    to: `${prefix}{{target}}/${fileName}`,
  };
}

function sanitizeBucketName(patternKey: string): string {
  const cleaned = patternKey
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return cleaned || "translations";
}
