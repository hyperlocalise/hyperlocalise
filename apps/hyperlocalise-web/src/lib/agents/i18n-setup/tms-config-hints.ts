import { parse as parseYaml } from "yaml";

import { parseI18nConfigJsonc, parseI18nConfigYaml } from "./merge-i18n-config";
import {
  extractLocaleFromPath,
  normalizeLocaleToken,
  type LocaleDetectionResult,
  type LocaleFileGroup,
} from "./locale-detection";
import type { I18nBucketFileMapping } from "./i18n-config-document";

export const TMS_CONFIG_CANDIDATE_PATHS = ["crowdin.yml", "crowdin.yaml", ".phrase.yml"] as const;

export type TmsProvider = "crowdin" | "phrase" | "lokalise" | "smartling";

export type TmsConfigHint = {
  provider: TmsProvider;
  configPath: string;
  sourceLocale?: string;
  targetLocales?: string[];
  fileMappings?: I18nBucketFileMapping[];
  storageAdapter?: TmsProvider;
  notes?: string[];
};

type CrowdinFileEntry = {
  source?: string;
  translation?: string;
  excluded_target_languages?: string[];
};

type CrowdinConfigYaml = {
  export_languages?: string[];
  files?: CrowdinFileEntry[];
};

type PhraseConfigYaml = {
  phrase?: {
    locale_mapping?: Record<string, string>;
    push?: {
      sources?: Array<{
        file?: string;
        params?: Record<string, unknown>;
      }>;
    };
    pull?: {
      targets?: Array<{
        file?: string;
        params?: Record<string, unknown>;
      }>;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeTmsPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeLocaleToken(value)))].toSorted((a, b) =>
    a.localeCompare(b),
  );
}

function replaceLocaleToken(path: string, locale: string, replacement: string): string {
  const normalized = normalizeTmsPath(path);
  const segments = normalized.split("/");
  const variants = uniqueSorted([
    normalizeLocaleToken(locale),
    normalizeLocaleToken(locale).replace(/-/g, "_"),
  ]);

  return segments
    .map((segment, index) => {
      const isFileName = index === segments.length - 1;
      if (isFileName) {
        const dotIndex = segment.lastIndexOf(".");
        const stem = dotIndex > 0 ? segment.slice(0, dotIndex) : segment;
        const extension = dotIndex > 0 ? segment.slice(dotIndex) : "";
        if (variants.includes(stem)) {
          return `${replacement}${extension}`;
        }
        return segment;
      }

      if (variants.includes(segment)) {
        return replacement;
      }

      return segment;
    })
    .join("/");
}

function inferSourceLocaleFromPath(path: string): string | null {
  const normalized = normalizeTmsPath(path);
  const fromFilename = extractLocaleFromPath(normalized);
  if (fromFilename) {
    return fromFilename;
  }

  const segments = normalized.split("/");
  const fileName = segments.at(-1) ?? normalized;
  const stem = fileName.replace(/\.[^.]+$/, "");
  const localePattern = /^([a-z]{2,3}(?:[-_][A-Z]{2})?(?:[-_][A-Za-z0-9]+)*)$/i;

  if (localePattern.test(stem)) {
    return normalizeLocaleToken(stem);
  }

  if (segments.length >= 2) {
    const parent = segments.at(-2) ?? "";
    if (localePattern.test(parent)) {
      return normalizeLocaleToken(parent);
    }
  }

  return null;
}

function convertCrowdinFileMapping(
  source: string,
  translation: string,
  explicitSourceLocale?: string,
): I18nBucketFileMapping | null {
  const normalizedSource = normalizeTmsPath(source);
  const normalizedTranslation = normalizeTmsPath(translation);
  const sourceLocale = explicitSourceLocale ?? inferSourceLocaleFromPath(normalizedSource) ?? null;
  const sourceBasename = normalizedSource.split("/").pop() ?? normalizedSource;
  const sourceStem = sourceBasename.replace(/\.[^.]+$/, "");
  const sourceExtension = sourceBasename.includes(".")
    ? sourceBasename.slice(sourceBasename.lastIndexOf("."))
    : "";

  let from = normalizedSource;
  if (sourceLocale) {
    from = replaceLocaleToken(from, sourceLocale, "{{source}}");
  }

  let to = normalizedTranslation
    .replace(/%locale%/gi, "{{target}}")
    .replace(/%language%/gi, "{{target}}")
    .replace(/%locale_with_underscore%/gi, "{{target}}")
    .replace(/%two_letters_code%/gi, "{{target}}")
    .replace(/%original_file_name%/gi, sourceBasename)
    .replace(/%file_name%/gi, sourceStem)
    .replace(/%file_extension%/gi, sourceExtension.replace(/^\./, ""))
    .replace(/%original_path%/gi, normalizedSource.split("/").slice(0, -1).join("/"));

  if (sourceLocale && !to.includes("{{target}}")) {
    to = replaceLocaleToken(to, sourceLocale, "{{target}}");
  }

  if (!from || !to) {
    return null;
  }

  return { from, to };
}

function convertPhraseFilePattern(path: string): string {
  return normalizeTmsPath(path)
    .replace(/<locale_name>/gi, "{{target}}")
    .replace(/<locale_code>/gi, "{{target}}");
}

function readPhraseParam(params: Record<string, unknown> | undefined, key: string): string | null {
  if (!params) {
    return null;
  }

  const value = params[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function parseCrowdinConfigHints(configPath: string, content: string): TmsConfigHint | null {
  let parsed: unknown;

  try {
    parsed = parseYaml(content);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const config = parsed as CrowdinConfigYaml;
  const files = Array.isArray(config.files) ? config.files : [];
  if (files.length === 0) {
    return null;
  }

  const fileMappings: I18nBucketFileMapping[] = [];
  const sourceLocales: string[] = [];
  const notes: string[] = [];

  for (const file of files) {
    if (typeof file.source !== "string" || typeof file.translation !== "string") {
      continue;
    }

    const sourceLocale = inferSourceLocaleFromPath(file.source);
    if (sourceLocale) {
      sourceLocales.push(sourceLocale);
    }

    const mapping = convertCrowdinFileMapping(
      file.source,
      file.translation,
      sourceLocale ?? undefined,
    );
    if (mapping) {
      fileMappings.push(mapping);
    }

    if (
      /%[A-Za-z0-9_]+%/.test(file.translation) &&
      !/%locale%|%language%/i.test(file.translation)
    ) {
      notes.push(
        `Crowdin translation pattern ${file.translation} uses custom placeholders; review converted mapping manually.`,
      );
    }
  }

  const exportLanguages = uniqueSorted(readStringArray(config.export_languages));
  const excludedLocales = uniqueSorted(
    files.flatMap((file) => readStringArray(file.excluded_target_languages)),
  );
  const targetLocales = exportLanguages.filter((locale) => !excludedLocales.includes(locale));

  return {
    provider: "crowdin",
    configPath,
    sourceLocale: sourceLocales[0],
    targetLocales: targetLocales.length > 0 ? targetLocales : undefined,
    fileMappings: fileMappings.length > 0 ? fileMappings : undefined,
    storageAdapter: "crowdin",
    notes: notes.length > 0 ? notes : undefined,
  };
}

export function parsePhraseConfigHints(configPath: string, content: string): TmsConfigHint | null {
  let parsed: unknown;

  try {
    parsed = parseYaml(content);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const config = parsed as PhraseConfigYaml;
  const phrase = config.phrase;
  if (!phrase) {
    return null;
  }

  const pushSources = phrase.push?.sources ?? [];
  const pullTargets = phrase.pull?.targets ?? [];
  if (pushSources.length === 0 && pullTargets.length === 0) {
    return null;
  }

  const fileMappings: I18nBucketFileMapping[] = [];
  const sourceLocales: string[] = [];
  const targetLocales = new Set<string>();

  for (const source of pushSources) {
    if (typeof source.file !== "string") {
      continue;
    }

    const localeId = readPhraseParam(source.params, "locale_id");
    const pathLocale = inferSourceLocaleFromPath(source.file);
    const sourceLocale = localeId ?? pathLocale;
    if (sourceLocale) {
      sourceLocales.push(normalizeLocaleToken(sourceLocale));
    }

    const normalizedFile = normalizeTmsPath(source.file);
    const localeTokens = uniqueSorted(
      [localeId, pathLocale, sourceLocale].filter((value): value is string => Boolean(value)),
    );
    let from = normalizedFile;
    for (const token of localeTokens) {
      const replaced = replaceLocaleToken(from, token, "{{source}}");
      if (replaced !== from) {
        from = replaced;
        break;
      }
    }

    const pullMatch = pullTargets.find((target) => typeof target.file === "string");
    const to = pullMatch?.file
      ? convertPhraseFilePattern(pullMatch.file)
      : convertPhraseFilePattern(normalizedFile);

    if (from && to) {
      fileMappings.push({ from, to });
    }
  }

  for (const target of pullTargets) {
    const localeId = readPhraseParam(target.params, "locale_id");
    if (localeId) {
      targetLocales.add(normalizeLocaleToken(localeId));
    }

    if (typeof target.file !== "string") {
      continue;
    }

    const pullPath = convertPhraseFilePattern(target.file);
    const pushSource = pushSources.find((source) => typeof source.file === "string");
    const pushPath = pushSource?.file;
    if (pushPath) {
      const pushSourceLocaleId = readPhraseParam(pushSource.params, "locale_id");
      const pathLocale = inferSourceLocaleFromPath(pushPath);
      const localeTokens = uniqueSorted(
        [pushSourceLocaleId, pathLocale].filter((value): value is string => Boolean(value)),
      );
      let from = normalizeTmsPath(pushPath);
      for (const token of localeTokens) {
        const replaced = replaceLocaleToken(from, token, "{{source}}");
        if (replaced !== from) {
          from = replaced;
          break;
        }
      }
      fileMappings.push({ from, to: pullPath });
    }
  }

  const dedupedMappings = dedupeFileMappings(fileMappings);

  return {
    provider: "phrase",
    configPath,
    sourceLocale: sourceLocales[0],
    targetLocales: targetLocales.size > 0 ? [...targetLocales].toSorted() : undefined,
    fileMappings: dedupedMappings.length > 0 ? dedupedMappings : undefined,
    storageAdapter: "phrase",
  };
}

function dedupeFileMappings(mappings: I18nBucketFileMapping[]): I18nBucketFileMapping[] {
  const seen = new Set<string>();
  const deduped: I18nBucketFileMapping[] = [];

  for (const mapping of mappings) {
    const key = `${mapping.from}\0${mapping.to}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(mapping);
  }

  return deduped;
}

export function parseTmsConfigFile(configPath: string, content: string): TmsConfigHint | null {
  switch (configPath) {
    case "crowdin.yml":
    case "crowdin.yaml":
      return parseCrowdinConfigHints(configPath, content);
    case ".phrase.yml":
      return parsePhraseConfigHints(configPath, content);
    default:
      return null;
  }
}

export function parseI18nStorageHints(
  configPath: string,
  content: string,
  format: "yml" | "jsonc",
): TmsConfigHint | null {
  const parsed = format === "yml" ? parseI18nConfigYaml(content) : parseI18nConfigJsonc(content);
  if (!parsed?.storage || !isRecord(parsed.storage)) {
    return null;
  }

  const adapter = parsed.storage.adapter;
  if (
    adapter !== "crowdin" &&
    adapter !== "phrase" &&
    adapter !== "lokalise" &&
    adapter !== "smartling"
  ) {
    return null;
  }

  const config = isRecord(parsed.storage.config) ? parsed.storage.config : {};
  const sourceLanguage =
    typeof config.sourceLanguage === "string"
      ? normalizeLocaleToken(config.sourceLanguage)
      : parsed.locales.source;
  const targetLanguages = uniqueSorted(readStringArray(config.targetLanguages));
  const fileMappings = Object.values(parsed.buckets).flatMap((bucket) => bucket.files);

  return {
    provider: adapter,
    configPath,
    sourceLocale: sourceLanguage,
    targetLocales:
      targetLanguages.length > 0 ? targetLanguages : uniqueSorted(parsed.locales.targets),
    fileMappings: fileMappings.length > 0 ? fileMappings : undefined,
    storageAdapter: adapter,
    notes: [
      `Existing ${format === "yml" ? "i18n.yml" : "i18n.jsonc"} uses storage adapter ${adapter}.`,
    ],
  };
}

export function collectTmsHints(
  configFiles: Array<{ path: string; content: string }>,
  existingConfig?:
    | { kind: "none" }
    | { kind: "yml"; content: string }
    | { kind: "jsonc"; content: string },
): TmsConfigHint[] {
  const hints: TmsConfigHint[] = [];

  for (const file of configFiles) {
    const hint = parseTmsConfigFile(file.path, file.content);
    if (hint) {
      hints.push(hint);
    }
  }

  if (existingConfig?.kind === "yml") {
    const storageHint = parseI18nStorageHints("i18n.yml", existingConfig.content, "yml");
    if (storageHint) {
      hints.push(storageHint);
    }
  }

  if (existingConfig?.kind === "jsonc") {
    const storageHint = parseI18nStorageHints("i18n.jsonc", existingConfig.content, "jsonc");
    if (storageHint) {
      hints.push(storageHint);
    }
  }

  return hints;
}

function mappingKey(mapping: I18nBucketFileMapping): string {
  return `${mapping.from}\0${mapping.to}`;
}

function sanitizeBucketName(path: string): string {
  const cleaned = path
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return cleaned || "translations";
}

function buildGroupFromMapping(mapping: I18nBucketFileMapping): LocaleFileGroup {
  return {
    id: sanitizeBucketName(mapping.from),
    files: [],
    pathPattern: mapping,
  };
}

export function buildDetectionFromTmsHints(hints: TmsConfigHint[]): LocaleDetectionResult | null {
  const merged = mergeTmsHintsIntoDetection(null, hints);
  if (!merged) {
    return null;
  }

  const hasStructure =
    merged.groups.length > 0 ||
    merged.targetLocales.length > 0 ||
    hints.some((hint) => hint.sourceLocale);

  return hasStructure ? merged : null;
}

export function mergeTmsHintsIntoDetection(
  detection: LocaleDetectionResult | null,
  hints: TmsConfigHint[],
): LocaleDetectionResult | null {
  if (hints.length === 0) {
    return detection;
  }

  const base: LocaleDetectionResult = detection ?? {
    sourceLocale: "en-US",
    targetLocales: [],
    groups: [],
    allFiles: [],
  };

  const merged: LocaleDetectionResult = structuredClone(base);
  const existingMappings = new Set(merged.groups.map((group) => mappingKey(group.pathPattern)));
  const targetLocales = new Set(merged.targetLocales);

  for (const hint of hints) {
    if (hint.sourceLocale) {
      merged.sourceLocale = normalizeLocaleToken(hint.sourceLocale);
    }

    for (const locale of hint.targetLocales ?? []) {
      const normalized = normalizeLocaleToken(locale);
      if (normalized !== merged.sourceLocale) {
        targetLocales.add(normalized);
      }
    }

    for (const mapping of hint.fileMappings ?? []) {
      const key = mappingKey(mapping);
      if (existingMappings.has(key)) {
        continue;
      }

      merged.groups.push(buildGroupFromMapping(mapping));
      existingMappings.add(key);
    }
  }

  merged.targetLocales = [...targetLocales]
    .filter((locale) => locale !== merged.sourceLocale)
    .toSorted((a, b) => a.localeCompare(b));
  merged.groups = merged.groups.toSorted((a, b) => a.id.localeCompare(b.id));

  return merged;
}

export function formatTmsHintsSummary(hints: TmsConfigHint[]): string | null {
  if (hints.length === 0) {
    return null;
  }

  const lines = hints.flatMap((hint) => {
    const hintLines = [`- ${hint.provider} (${hint.configPath})`];

    if (hint.sourceLocale) {
      hintLines.push(`  source locale: ${hint.sourceLocale}`);
    }

    if (hint.targetLocales?.length) {
      hintLines.push(`  target locales: ${hint.targetLocales.join(", ")}`);
    }

    for (const mapping of hint.fileMappings ?? []) {
      hintLines.push(`  mapping: ${mapping.from} -> ${mapping.to}`);
    }

    for (const note of hint.notes ?? []) {
      hintLines.push(`  note: ${note}`);
    }

    return hintLines;
  });

  return lines.join("\n");
}
