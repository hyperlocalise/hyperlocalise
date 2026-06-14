import { z } from "zod";

/** Curated locales for fast project setup; any valid BCP-47 tag is still accepted. */
export const COMMON_LOCALES = [
  "en",
  "en-US",
  "en-GB",
  "en-AU",
  "en-IN",
  "es-ES",
  "es-MX",
  "fr-FR",
  "fr-CA",
  "de-DE",
  "it-IT",
  "pt-BR",
  "pt-PT",
  "nl-NL",
  "sv-SE",
  "da-DK",
  "nb-NO",
  "fi-FI",
  "pl-PL",
  "cs-CZ",
  "hu-HU",
  "ro-RO",
  "tr-TR",
  "el-GR",
  "ru-RU",
  "uk-UA",
  "ar-SA",
  "he-IL",
  "fa-IR",
  "hi-IN",
  "bn-BD",
  "id-ID",
  "ms-MY",
  "vi-VN",
  "th-TH",
  "fil-PH",
  "ja-JP",
  "ko-KR",
  "zh-CN",
  "zh-TW",
  "zh-HK",
] as const;

export type CommonLocale = (typeof COMMON_LOCALES)[number];

export const maxProjectTargetLocales = 50;

const RTL_LANGUAGE_PREFIXES = new Set(["ar", "fa", "he", "ur", "ps", "sd", "yi"]);

const localeLabelFormatter =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "language" })
    : null;

const regionLabelFormatter =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/**
 * Canonicalizes a user or provider locale tag when the runtime accepts it.
 * Returns null for empty or invalid input.
 */
export function canonicalizeLocale(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (typeof Intl === "undefined" || typeof Intl.getCanonicalLocales !== "function") {
    return trimmed;
  }

  try {
    const [canonical] = Intl.getCanonicalLocales(trimmed);
    return canonical ?? null;
  } catch {
    return null;
  }
}

export function isValidLocaleInput(input: string): boolean {
  return canonicalizeLocale(input) !== null;
}

export function getLocaleLabel(locale: string): string {
  const canonical = canonicalizeLocale(locale) ?? locale;

  try {
    const parsed = new Intl.Locale(canonical);
    const languageLabel = localeLabelFormatter?.of(parsed.language) ?? parsed.language;
    const region = parsed.region;

    if (region) {
      const regionLabel = regionLabelFormatter?.of(region) ?? region;
      return `${languageLabel} (${regionLabel})`;
    }

    return languageLabel;
  } catch {
    return canonical;
  }
}

export function isRtlLocale(locale: string): boolean {
  const canonical = canonicalizeLocale(locale);
  if (!canonical) {
    return false;
  }

  try {
    const parsed = new Intl.Locale(canonical);
    if (parsed.getTextInfo) {
      return parsed.getTextInfo().direction === "rtl";
    }
  } catch {
    // Fall through to language-prefix heuristic.
  }

  const language = canonical.split("-")[0]?.toLowerCase();
  return language ? RTL_LANGUAGE_PREFIXES.has(language) : false;
}

export function normalizeTargetLocales(
  locales: string[],
  options?: { max?: number },
): string[] | null {
  const max = options?.max ?? maxProjectTargetLocales;
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of locales) {
    const canonical = canonicalizeLocale(raw);
    if (!canonical) {
      return null;
    }

    const key = canonical.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(canonical);

    if (normalized.length > max) {
      return null;
    }
  }

  return normalized;
}

export function normalizeProjectLocales(input: {
  sourceLocale: string;
  targetLocales: string[];
  maxTargets?: number;
}):
  | { sourceLocale: string; targetLocales: string[] }
  | { error: "invalid_source_locale" | "invalid_target_locales" | "source_in_targets" } {
  const sourceLocale = canonicalizeLocale(input.sourceLocale);
  if (!sourceLocale) {
    return { error: "invalid_source_locale" };
  }

  const targetLocales = normalizeTargetLocales(input.targetLocales, {
    max: input.maxTargets ?? maxProjectTargetLocales,
  });
  if (!targetLocales || targetLocales.length === 0) {
    return { error: "invalid_target_locales" };
  }

  if (targetLocales.some((locale) => locale.toLowerCase() === sourceLocale.toLowerCase())) {
    return { error: "source_in_targets" };
  }

  return { sourceLocale, targetLocales };
}

export type ProjectLocalePatchError =
  | "invalid_source_locale"
  | "invalid_target_locales"
  | "source_in_targets";

/**
 * Normalizes a partial project locale PATCH without fabricating empty fallbacks.
 * Cross-field checks run only when both source and targets are configured after merge.
 */
export function normalizeProjectLocalePatch(input: {
  existingSourceLocale: string | null;
  existingTargetLocales: string[];
  sourceLocale?: string;
  targetLocales?: string[];
  maxTargets?: number;
}): { sourceLocale?: string; targetLocales?: string[] } | { error: ProjectLocalePatchError } {
  const patchingSource = input.sourceLocale !== undefined;
  const patchingTargets = input.targetLocales !== undefined;

  if (patchingSource && patchingTargets) {
    const full = normalizeProjectLocales({
      sourceLocale: input.sourceLocale!,
      targetLocales: input.targetLocales!,
      maxTargets: input.maxTargets,
    });
    if ("error" in full) {
      return { error: full.error };
    }
    return {
      sourceLocale: full.sourceLocale,
      targetLocales: full.targetLocales,
    };
  }

  let resolvedSource = input.existingSourceLocale;
  let resolvedTargets = input.existingTargetLocales;
  const updates: { sourceLocale?: string; targetLocales?: string[] } = {};

  if (patchingSource) {
    const canonical = canonicalizeLocale(input.sourceLocale!);
    if (!canonical) {
      return { error: "invalid_source_locale" };
    }
    resolvedSource = canonical;
    updates.sourceLocale = canonical;
  }

  if (patchingTargets) {
    const normalized = normalizeTargetLocales(input.targetLocales!, {
      max: input.maxTargets ?? maxProjectTargetLocales,
    });
    if (!normalized || normalized.length === 0) {
      return { error: "invalid_target_locales" };
    }
    resolvedTargets = normalized;
    updates.targetLocales = normalized;
  }

  if (resolvedSource && resolvedTargets.length > 0) {
    if (resolvedTargets.some((locale) => locale.toLowerCase() === resolvedSource!.toLowerCase())) {
      return { error: "source_in_targets" };
    }
  }

  return updates;
}

export const localeInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .refine((value) => isValidLocaleInput(value), {
    message: "invalid locale format (e.g. en, en-US, fr-FR, zh-Hant-TW)",
  })
  .transform((value) => canonicalizeLocale(value) as string);

export const projectTargetLocalesSchema = z
  .array(localeInputSchema)
  .min(1, "at least one target locale is required")
  .max(maxProjectTargetLocales)
  .transform((locales) => normalizeTargetLocales(locales) as string[]);
