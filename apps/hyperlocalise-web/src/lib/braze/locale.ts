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
import { canonicalizeLocale } from "@/lib/i18n/locales";

/**
 * Preferred Braze copy suffix for a project locale.
 * Language-only except locked regional pairs that must stay distinct.
 */
export const PROJECT_LOCALE_TO_BRAZE_SUFFIX: Record<string, string> = {
  ar: "ar",
  "ar-SA": "ar",
  cs: "cs",
  "cs-CZ": "cs",
  da: "da",
  "da-DK": "da",
  de: "de",
  "de-DE": "de",
  el: "el",
  "el-GR": "el",
  en: "en",
  "en-US": "en-US",
  "en-GB": "en-GB",
  "en-AU": "en",
  "en-IN": "en",
  es: "es",
  "es-ES": "es",
  "es-MX": "es",
  fi: "fi",
  "fi-FI": "fi",
  fr: "fr",
  "fr-FR": "fr",
  "fr-CA": "fr",
  he: "he",
  "he-IL": "he",
  hu: "hu",
  "hu-HU": "hu",
  id: "id",
  "id-ID": "id",
  it: "it",
  "it-IT": "it",
  ja: "ja",
  "ja-JP": "ja",
  ko: "ko",
  "ko-KR": "ko",
  nb: "nb",
  "nb-NO": "nb",
  nl: "nl",
  "nl-NL": "nl",
  pl: "pl",
  "pl-PL": "pl",
  pt: "pt",
  "pt-PT": "pt",
  "pt-BR": "pt-BR",
  ro: "ro",
  "ro-RO": "ro",
  ru: "ru",
  "ru-RU": "ru",
  sv: "sv",
  "sv-SE": "sv",
  tr: "tr",
  "tr-TR": "tr",
  vi: "vi",
  "vi-VN": "vi",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
};

const LOCKED_LOCALE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["pt", "pt-BR"],
  ["zh-CN", "zh-TW"],
  ["en-US", "en-GB"],
];

export function normalizeBrazeLocaleTag(locale: string): string {
  const normalized = locale.trim().replace(/_/g, "-");
  return canonicalizeLocale(normalized) ?? normalized;
}

function parseLocaleParts(locale: string): { language: string; region: string | null } {
  const normalized = normalizeBrazeLocaleTag(locale);
  try {
    const parsed = new Intl.Locale(normalized);
    return {
      language: parsed.language.toLowerCase(),
      region: parsed.region?.toUpperCase() ?? null,
    };
  } catch {
    const [language, maybeRegion] = normalized.split("-");
    return {
      language: (language ?? normalized).toLowerCase(),
      region: maybeRegion && /^[A-Za-z]{2}$/.test(maybeRegion) ? maybeRegion.toUpperCase() : null,
    };
  }
}

function uniqueNonEmptyLocales(values: readonly string[]): string[] {
  const locales: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const locale = value.trim();
    if (!locale) {
      continue;
    }
    const key = normalizeBrazeLocaleTag(locale).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    locales.push(locale);
  }
  return locales;
}

function localeLockKeys(locale: string): string[] {
  const normalized = normalizeBrazeLocaleTag(locale);
  const suffix = PROJECT_LOCALE_TO_BRAZE_SUFFIX[normalized] ?? normalized;
  return [...new Set([normalized, suffix, locale.trim()])];
}

function isLockedLocalePair(left: string, right: string): boolean {
  const leftKeys = localeLockKeys(left);
  const rightKeys = localeLockKeys(right);
  if (leftKeys.some((key) => rightKeys.includes(key))) {
    return false;
  }
  return LOCKED_LOCALE_PAIRS.some(
    ([first, second]) =>
      (leftKeys.includes(first) && rightKeys.includes(second)) ||
      (leftKeys.includes(second) && rightKeys.includes(first)),
  );
}

export function brazeLocalesShareLanguage(left: string, right: string): boolean {
  const leftLanguage = parseLocaleParts(left).language;
  const rightLanguage = parseLocaleParts(right).language;
  return Boolean(leftLanguage) && leftLanguage === rightLanguage;
}

export function areBrazeSourceLocalesCompatible(left: string, right: string): boolean {
  return brazeLocalesShareLanguage(left, right) && !isLockedLocalePair(left, right);
}

/**
 * Locale suffix written onto Braze library copies (`Template_Name_fr`).
 */
export function resolveBrazeLocaleSuffix(projectLocale: string): string {
  const normalized = normalizeBrazeLocaleTag(projectLocale);
  if (PROJECT_LOCALE_TO_BRAZE_SUFFIX[normalized]) {
    return PROJECT_LOCALE_TO_BRAZE_SUFFIX[normalized];
  }
  if (PROJECT_LOCALE_TO_BRAZE_SUFFIX[projectLocale.trim()]) {
    return PROJECT_LOCALE_TO_BRAZE_SUFFIX[projectLocale.trim()];
  }
  const parts = parseLocaleParts(normalized);
  if (parts.region && isLockedLocalePair(parts.language, normalized)) {
    return `${parts.language}-${parts.region}`;
  }
  return parts.language || normalized;
}

export function mapProjectLocalesToBraze(input: {
  projectSourceLocale: string;
  projectTargetLocales: readonly string[];
  configuredSourceLocale?: string | null;
  configuredTargetLocales?: readonly string[];
}): {
  sourceSuffix: string | null;
  jobTargetLocales: string[];
  brazeSuffixes: string[];
  unmappedProjectTargets: string[];
} {
  const projectSource = input.projectSourceLocale.trim() || "en";
  const configuredSource = input.configuredSourceLocale?.trim() || "";
  if (configuredSource && !areBrazeSourceLocalesCompatible(configuredSource, projectSource)) {
    return {
      sourceSuffix: null,
      jobTargetLocales: [],
      brazeSuffixes: [],
      unmappedProjectTargets: [],
    };
  }

  const sourceSuffix = resolveBrazeLocaleSuffix(configuredSource || projectSource);
  const targetInputs =
    input.configuredTargetLocales && input.configuredTargetLocales.length > 0
      ? input.configuredTargetLocales
      : input.projectTargetLocales;

  const jobTargetLocales: string[] = [];
  const brazeSuffixes: string[] = [];
  const unmappedProjectTargets: string[] = [];
  const seenProject = new Set<string>();
  const seenSuffix = new Set<string>();

  for (const targetLocale of uniqueNonEmptyLocales(targetInputs)) {
    const suffix = resolveBrazeLocaleSuffix(targetLocale);
    if (!suffix) {
      unmappedProjectTargets.push(targetLocale);
      continue;
    }
    if (normalizeBrazeLocaleTag(suffix) === normalizeBrazeLocaleTag(sourceSuffix)) {
      continue;
    }
    const projectKey = normalizeBrazeLocaleTag(targetLocale).toLowerCase();
    const suffixKey = normalizeBrazeLocaleTag(suffix).toLowerCase();
    if (seenProject.has(projectKey) || seenSuffix.has(suffixKey)) {
      continue;
    }
    seenProject.add(projectKey);
    seenSuffix.add(suffixKey);
    jobTargetLocales.push(targetLocale);
    brazeSuffixes.push(suffix);
  }

  return {
    sourceSuffix,
    jobTargetLocales,
    brazeSuffixes,
    unmappedProjectTargets,
  };
}

export function isBrazeLocaleCopyName(input: {
  name: string;
  suffixes: readonly string[];
}): boolean {
  const name = input.name.trim();
  if (!name) {
    return false;
  }
  return input.suffixes.some((suffix) => {
    const token = suffix.trim();
    if (!token) {
      return false;
    }
    return name.endsWith(`_${token}`) || name.toLowerCase().endsWith(`_${token.toLowerCase()}`);
  });
}
