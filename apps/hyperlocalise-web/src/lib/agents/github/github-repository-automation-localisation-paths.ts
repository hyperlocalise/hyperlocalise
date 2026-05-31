import { normalizeJsonc } from "@/lib/i18n/parse-jsonc-config";

const SUPPORTED_LOCALISATION_EXTENSIONS = [".json", ".jsonc", ".arb"] as const;

export type I18nBucketFilePatterns = {
  sourcePatterns: string[];
  targetPatterns: string[];
};

type BucketFileEntry = {
  from?: string;
  to?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectBucketFilePatterns(buckets: unknown): I18nBucketFilePatterns {
  const sourcePatterns = new Set<string>();
  const targetPatterns = new Set<string>();

  if (!isRecord(buckets)) {
    return { sourcePatterns: [], targetPatterns: [] };
  }

  for (const bucket of Object.values(buckets)) {
    if (!isRecord(bucket)) {
      continue;
    }

    const files = bucket.files;
    if (!Array.isArray(files)) {
      continue;
    }

    for (const file of files) {
      if (!isRecord(file)) {
        continue;
      }

      const entry = file as BucketFileEntry;
      if (typeof entry.from === "string" && entry.from.trim().length > 0) {
        sourcePatterns.add(entry.from.trim());
      }
      if (typeof entry.to === "string" && entry.to.trim().length > 0) {
        targetPatterns.add(entry.to.trim());
      }
    }
  }

  return {
    sourcePatterns: [...sourcePatterns],
    targetPatterns: [...targetPatterns],
  };
}

export function extractI18nBucketFilePatternsFromConfigText(
  configText: string,
  filename: string,
): I18nBucketFilePatterns | null {
  try {
    const jsonText = filename.endsWith(".jsonc") ? normalizeJsonc(configText) : configText;
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (filename.endsWith(".yml") || filename.endsWith(".yaml")) {
      return null;
    }
    return collectBucketFilePatterns(parsed.buckets);
  } catch {
    return null;
  }
}

export function extractI18nBucketFilePatternsFromConfigJson(
  configJson: Record<string, unknown>,
): I18nBucketFilePatterns {
  return collectBucketFilePatterns(configJson.buckets);
}

function globPatternToRegExp(pattern: string): RegExp {
  let regexSource = "^";

  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];

    if (character === "*" && pattern[index + 1] === "*") {
      regexSource += ".*";
      index += 1;
      continue;
    }

    if (character === "*") {
      regexSource += "[^/]*";
      continue;
    }

    if (character === "?") {
      regexSource += "[^/]";
      continue;
    }

    if (/[.+^${}()|[\]\\]/.test(character)) {
      regexSource += `\\${character}`;
      continue;
    }

    regexSource += character;
  }

  regexSource += "$";
  return new RegExp(regexSource);
}

export function pathMatchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = path.replaceAll("\\", "/");
  const normalizedPattern = pattern.replaceAll("\\", "/");
  return globPatternToRegExp(normalizedPattern).test(normalizedPath);
}

export function pathMatchesLocalisationPatterns(
  path: string,
  patterns: I18nBucketFilePatterns,
): boolean {
  const normalizedPath = path.replaceAll("\\", "/");
  const extension = normalizedPath.slice(normalizedPath.lastIndexOf(".")).toLowerCase();

  if (
    !SUPPORTED_LOCALISATION_EXTENSIONS.includes(
      extension as (typeof SUPPORTED_LOCALISATION_EXTENSIONS)[number],
    )
  ) {
    return false;
  }

  const allPatterns = [...patterns.sourcePatterns, ...patterns.targetPatterns];
  if (allPatterns.length === 0) {
    return SUPPORTED_LOCALISATION_EXTENSIONS.some((suffix) => normalizedPath.endsWith(suffix));
  }

  return allPatterns.some(
    (pattern) =>
      pathMatchesPattern(normalizedPath, pattern) ||
      pathMatchesPattern(
        normalizedPath,
        pattern
          .replace("{{source}}", "*")
          .replace("{{target}}", "*")
          .replace("{{locale}}", "*")
          .replace("{{localeDir}}", "*"),
      ),
  );
}

export function filterPathsToSourceScope(
  paths: string[],
  patterns: I18nBucketFilePatterns,
): string[] {
  return filterPathsToLocalisationScope(paths, {
    sourcePatterns: patterns.sourcePatterns,
    targetPatterns: [],
  });
}

export function filterPathsToLocalisationScope(
  paths: string[],
  patterns: I18nBucketFilePatterns,
): string[] {
  const unique = new Set<string>();

  for (const path of paths) {
    const trimmed = path.trim();
    if (!trimmed) {
      continue;
    }
    if (pathMatchesLocalisationPatterns(trimmed, patterns)) {
      unique.add(trimmed.replaceAll("\\", "/"));
    }
  }

  return [...unique].sort();
}

export function mergeI18nBucketFilePatterns(
  left: I18nBucketFilePatterns,
  right: I18nBucketFilePatterns,
): I18nBucketFilePatterns {
  return {
    sourcePatterns: [...new Set([...left.sourcePatterns, ...right.sourcePatterns])],
    targetPatterns: [...new Set([...left.targetPatterns, ...right.targetPatterns])],
  };
}
