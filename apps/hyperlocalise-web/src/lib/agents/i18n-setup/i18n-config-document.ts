import type { LocaleDetectionResult } from "./locale-detection";

export type I18nBucketFileMapping = {
  from: string;
  to: string;
};

export type I18nBucketConfig = {
  files: I18nBucketFileMapping[];
};

export type I18nConfigDocument = {
  locales: {
    source: string;
    targets: string[];
    fallbacks?: Record<string, string[]>;
  };
  buckets: Record<string, I18nBucketConfig>;
  groups?: Record<string, { targets?: string[]; buckets?: string[] }>;
  llm?: Record<string, unknown>;
  hyperlocalise?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  cache?: Record<string, unknown>;
};

function inferDefaultFileExtension(detection: LocaleDetectionResult): string {
  const counts = new Map<string, number>();

  for (const file of detection.allFiles) {
    const dotIndex = file.path.lastIndexOf(".");
    const extension = dotIndex === -1 ? "json" : file.path.slice(dotIndex + 1).toLowerCase();
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }

  let bestExtension = "json";
  let bestCount = 0;

  for (const [extension, count] of counts.entries()) {
    if (count > bestCount) {
      bestExtension = extension;
      bestCount = count;
    }
  }

  return bestExtension;
}

export function buildI18nConfigDocumentFromDetection(
  detection: LocaleDetectionResult,
): I18nConfigDocument {
  const defaultExtension = inferDefaultFileExtension(detection);
  const buckets: Record<string, I18nBucketConfig> = {};

  if (detection.groups.length === 0) {
    buckets.translations = {
      files: [
        {
          from: `locales/{{source}}.${defaultExtension}`,
          to: `locales/{{target}}.${defaultExtension}`,
        },
      ],
    };
  } else {
    for (const group of detection.groups) {
      buckets[group.id] = {
        files: [group.pathPattern],
      };
    }
  }

  return {
    locales: {
      source: detection.sourceLocale,
      targets: detection.targetLocales.length > 0 ? detection.targetLocales : ["es-ES"],
    },
    buckets,
    llm: {
      profiles: {
        default: {
          provider: "openai",
          model: "gpt-5.2",
        },
      },
    },
  };
}

function yamlScalar(value: string): string {
  if (/^[a-zA-Z0-9._/{}-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function appendBucketYaml(lines: string[], bucketName: string, bucket: I18nBucketConfig): void {
  lines.push(`  ${bucketName}:`);
  lines.push("    files:");
  for (const file of bucket.files) {
    lines.push(`      - from: ${yamlScalar(file.from)}`);
    lines.push(`        to: ${yamlScalar(file.to)}`);
  }
}

function appendRecordSection(
  lines: string[],
  sectionName: string,
  value: Record<string, unknown>,
): void {
  lines.push(`${sectionName}:`);
  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue === undefined) {
      continue;
    }

    if (typeof nestedValue === "object" && nestedValue !== null && !Array.isArray(nestedValue)) {
      lines.push(`  ${key}:`);
      for (const [childKey, childValue] of Object.entries(nestedValue as Record<string, unknown>)) {
        if (childValue === undefined) {
          continue;
        }

        if (typeof childValue === "string") {
          lines.push(`    ${childKey}: ${yamlScalar(childValue)}`);
          continue;
        }

        if (Array.isArray(childValue)) {
          lines.push(`    ${childKey}:`);
          for (const item of childValue) {
            if (typeof item === "string") {
              lines.push(`      - ${yamlScalar(item)}`);
            }
          }
          continue;
        }

        if (typeof childValue === "object" && childValue !== null) {
          lines.push(`    ${childKey}:`);
          for (const [grandchildKey, grandchildValue] of Object.entries(
            childValue as Record<string, unknown>,
          )) {
            if (typeof grandchildValue === "string") {
              lines.push(`      ${grandchildKey}: ${yamlScalar(grandchildValue)}`);
            }
          }
        }
      }
      continue;
    }

    if (typeof nestedValue === "string") {
      lines.push(`  ${key}: ${yamlScalar(nestedValue)}`);
    }
  }
}

export function serializeI18nConfigYaml(
  config: I18nConfigDocument,
  options?: { headerComment?: string },
): string {
  const lines: string[] = [];

  if (options?.headerComment) {
    lines.push(`# ${options.headerComment}`);
  }

  lines.push("locales:");
  lines.push(`  source: ${yamlScalar(config.locales.source)}`);
  lines.push("  targets:");
  for (const locale of config.locales.targets) {
    lines.push(`    - ${yamlScalar(locale)}`);
  }

  lines.push("", "buckets:");
  for (const [bucketName, bucket] of Object.entries(config.buckets).toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    appendBucketYaml(lines, bucketName, bucket);
  }

  if (config.llm) {
    lines.push("");
    appendRecordSection(lines, "llm", config.llm);
  }

  if (config.groups) {
    lines.push("", "groups:");
    for (const [groupName, group] of Object.entries(config.groups).toSorted(([a], [b]) =>
      a.localeCompare(b),
    )) {
      lines.push(`  ${groupName}:`);
      if (group.targets?.length) {
        lines.push("    targets:");
        for (const locale of group.targets) {
          lines.push(`      - ${yamlScalar(locale)}`);
        }
      }
      if (group.buckets?.length) {
        lines.push("    buckets:");
        for (const bucket of group.buckets) {
          lines.push(`      - ${yamlScalar(bucket)}`);
        }
      }
    }
  }

  if (config.storage) {
    lines.push("");
    appendRecordSection(lines, "storage", config.storage);
  }

  if (config.hyperlocalise) {
    lines.push("");
    appendRecordSection(lines, "hyperlocalise", config.hyperlocalise);
  }

  if (config.cache) {
    lines.push("");
    appendRecordSection(lines, "cache", config.cache);
  }

  lines.push("");
  return lines.join("\n");
}

export function generateI18nConfigYaml(detection: LocaleDetectionResult): string {
  const document = buildI18nConfigDocumentFromDetection(detection);
  return serializeI18nConfigYaml(document, {
    headerComment: "Generated by Hyperlocalise i18n setup wizard.",
  }).replace(
    /^# Generated by Hyperlocalise i18n setup wizard\.\n/,
    "# Generated by Hyperlocalise i18n setup wizard.\n# Review locale mappings and LLM provider settings before merging.\n",
  );
}
