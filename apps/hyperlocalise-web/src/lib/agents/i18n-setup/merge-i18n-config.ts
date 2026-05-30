import { parse as parseYaml } from "yaml";

import { normalizeJsonc } from "@/lib/i18n/parse-jsonc-config";

import {
  buildI18nConfigDocumentFromDetection,
  serializeI18nConfigYaml,
  type I18nBucketFileMapping,
  type I18nConfigDocument,
} from "./i18n-config-document";
import type { LocaleDetectionResult } from "./locale-detection";

export type I18nSetupMode = "create" | "update" | "convert";

export type MergeI18nConfigResult = {
  config: I18nConfigDocument;
  yaml: string;
  hasChanges: boolean;
  addedTargetLocales: string[];
  addedFileMappings: I18nBucketFileMapping[];
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

function readFileMappings(value: unknown): I18nBucketFileMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const mappings: I18nBucketFileMapping[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const from = item.from;
    const to = item.to;
    if (typeof from === "string" && typeof to === "string") {
      mappings.push({ from, to });
    }
  }

  return mappings;
}

function readBuckets(value: unknown): Record<string, { files: I18nBucketFileMapping[] }> {
  if (!isRecord(value)) {
    return {};
  }

  const buckets: Record<string, { files: I18nBucketFileMapping[] }> = {};

  for (const [bucketName, bucketValue] of Object.entries(value)) {
    if (!isRecord(bucketValue)) {
      continue;
    }

    buckets[bucketName] = {
      files: readFileMappings(bucketValue.files),
    };
  }

  return buckets;
}

export function parseI18nConfigObject(parsed: unknown): I18nConfigDocument | null {
  if (!isRecord(parsed) || !isRecord(parsed.locales)) {
    return null;
  }

  const source = parsed.locales.source;
  if (typeof source !== "string" || source.length === 0) {
    return null;
  }

  const targets = readStringArray(parsed.locales.targets);
  const buckets = readBuckets(parsed.buckets);
  if (Object.keys(buckets).length === 0) {
    return null;
  }

  const fallbacksValue = parsed.locales.fallbacks;
  const fallbacks = isRecord(fallbacksValue)
    ? Object.fromEntries(
        Object.entries(fallbacksValue).flatMap(([locale, chain]) => {
          const normalized = readStringArray(chain);
          return normalized.length > 0 ? [[locale, normalized]] : [];
        }),
      )
    : undefined;

  return {
    locales: {
      source,
      targets,
      fallbacks: fallbacks && Object.keys(fallbacks).length > 0 ? fallbacks : undefined,
    },
    buckets,
    groups: isRecord(parsed.groups)
      ? Object.fromEntries(
          Object.entries(parsed.groups).flatMap(([groupName, groupValue]) => {
            if (!isRecord(groupValue)) {
              return [];
            }

            return [
              [
                groupName,
                {
                  targets: readStringArray(groupValue.targets),
                  buckets: readStringArray(groupValue.buckets),
                },
              ],
            ];
          }),
        )
      : undefined,
    llm: isRecord(parsed.llm) ? parsed.llm : undefined,
    hyperlocalise: isRecord(parsed.hyperlocalise) ? parsed.hyperlocalise : undefined,
    storage: isRecord(parsed.storage) ? parsed.storage : undefined,
    cache: isRecord(parsed.cache) ? parsed.cache : undefined,
  };
}

export function parseI18nConfigJsonc(jsonc: string): I18nConfigDocument | null {
  try {
    const parsed = JSON.parse(normalizeJsonc(jsonc)) as unknown;
    return parseI18nConfigObject(parsed);
  } catch {
    return null;
  }
}

export function parseI18nConfigYaml(yaml: string): I18nConfigDocument | null {
  let parsed: unknown;

  try {
    parsed = parseYaml(yaml);
  } catch {
    return null;
  }

  return parseI18nConfigObject(parsed);
}

function mappingKey(mapping: I18nBucketFileMapping): string {
  return `${mapping.from}\0${mapping.to}`;
}

function collectExistingMappings(config: I18nConfigDocument): Set<string> {
  const keys = new Set<string>();

  for (const bucket of Object.values(config.buckets)) {
    for (const mapping of bucket.files) {
      keys.add(mappingKey(mapping));
    }
  }

  return keys;
}

function findAvailableBucketName(config: I18nConfigDocument, preferred: string): string {
  if (!config.buckets[preferred]) {
    return preferred;
  }

  let suffix = 2;
  while (config.buckets[`${preferred}_${suffix}`]) {
    suffix += 1;
  }

  return `${preferred}_${suffix}`;
}

export function mergeI18nConfigWithDetection(
  existing: I18nConfigDocument,
  detection: LocaleDetectionResult,
): MergeI18nConfigResult {
  const merged: I18nConfigDocument = structuredClone(existing);
  const addedTargetLocales: string[] = [];
  const addedFileMappings: I18nBucketFileMapping[] = [];
  const existingMappings = collectExistingMappings(existing);
  const existingTargets = new Set(existing.locales.targets);

  for (const locale of detection.targetLocales) {
    if (locale === merged.locales.source || existingTargets.has(locale)) {
      continue;
    }

    merged.locales.targets.push(locale);
    existingTargets.add(locale);
    addedTargetLocales.push(locale);
  }

  merged.locales.targets = [...merged.locales.targets].toSorted((a, b) => a.localeCompare(b));

  for (const group of detection.groups) {
    const mapping = group.pathPattern;
    const key = mappingKey(mapping);

    if (existingMappings.has(key)) {
      continue;
    }

    const bucketName = findAvailableBucketName(merged, group.id);
    merged.buckets[bucketName] = { files: [mapping] };
    existingMappings.add(key);
    addedFileMappings.push(mapping);
  }

  const hasChanges = addedTargetLocales.length > 0 || addedFileMappings.length > 0;
  const yaml = serializeI18nConfigYaml(merged, {
    headerComment: hasChanges
      ? "Updated by Hyperlocalise i18n setup wizard."
      : "Generated by Hyperlocalise i18n setup wizard.",
  });

  return {
    config: merged,
    yaml,
    hasChanges,
    addedTargetLocales,
    addedFileMappings,
  };
}

export function buildSuggestedI18nConfigYaml(
  detection: LocaleDetectionResult,
  existingYaml?: string | null,
): { yaml: string; mode: "create" | "update"; hasChanges: boolean } {
  if (!existingYaml) {
    return {
      yaml: serializeI18nConfigYaml(buildI18nConfigDocumentFromDetection(detection), {
        headerComment: "Generated by Hyperlocalise i18n setup wizard.",
      }).replace(
        /^# Generated by Hyperlocalise i18n setup wizard\.\n/,
        "# Generated by Hyperlocalise i18n setup wizard.\n# Review locale mappings and LLM provider settings before merging.\n",
      ),
      mode: "create",
      hasChanges: true,
    };
  }

  const existing = parseI18nConfigYaml(existingYaml);
  if (!existing) {
    return {
      yaml: serializeI18nConfigYaml(buildI18nConfigDocumentFromDetection(detection), {
        headerComment: "Generated by Hyperlocalise i18n setup wizard.",
      }),
      mode: "create",
      hasChanges: true,
    };
  }

  const merged = mergeI18nConfigWithDetection(existing, detection);
  return {
    yaml: merged.yaml,
    mode: "update",
    hasChanges: merged.hasChanges,
  };
}

export type I18nSetupSuggestion = {
  yaml: string;
  mode: I18nSetupMode;
  hasChanges: boolean;
  removeJsonc: boolean;
};

export function buildI18nSetupSuggestion(
  detection: LocaleDetectionResult,
  existingConfig:
    | { kind: "none" }
    | { kind: "yml"; content: string }
    | { kind: "jsonc"; content: string },
): I18nSetupSuggestion | { error: "i18n_jsonc_parse_failed" } {
  if (existingConfig.kind === "jsonc") {
    const existing = parseI18nConfigJsonc(existingConfig.content);
    if (!existing) {
      return { error: "i18n_jsonc_parse_failed" };
    }

    const merged = mergeI18nConfigWithDetection(existing, detection);
    return {
      yaml: serializeI18nConfigYaml(merged.config, {
        headerComment: "Migrated from i18n.jsonc by Hyperlocalise i18n setup wizard.",
      }),
      mode: "convert",
      hasChanges: true,
      removeJsonc: true,
    };
  }

  if (existingConfig.kind === "yml") {
    const suggestion = buildSuggestedI18nConfigYaml(detection, existingConfig.content);
    return {
      ...suggestion,
      removeJsonc: false,
    };
  }

  const suggestion = buildSuggestedI18nConfigYaml(detection, null);
  return {
    ...suggestion,
    removeJsonc: false,
  };
}
