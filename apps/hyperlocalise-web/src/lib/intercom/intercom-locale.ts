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
 * Intercom Articles API `translated_content` keys (REST 2.16 / 2.6 article model)
 * mapped to the preferred Hyperlocalise project locale.
 *
 * @see https://developers.intercom.com/docs/references/rest-api/api.intercom.io/models/article_translated_content
 * @see https://developers.intercom.com/docs/references/2.6/rest-api/articles/the-article-model.md
 */
export const INTERCOM_ARTICLE_LOCALE_TO_PROJECT = {
  ar: "ar-SA",
  bg: "bg",
  bs: "bs",
  ca: "ca",
  cs: "cs-CZ",
  da: "da-DK",
  de: "de-DE",
  "de-form": "de-form",
  el: "el-GR",
  en: "en",
  es: "es-ES",
  et: "et",
  fi: "fi-FI",
  fr: "fr-FR",
  he: "he-IL",
  hr: "hr",
  hu: "hu-HU",
  id: "id-ID",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  lt: "lt",
  lv: "lv",
  mn: "mn",
  nb: "nb-NO",
  nl: "nl-NL",
  pl: "pl-PL",
  pt: "pt-PT",
  "pt-BR": "pt-BR",
  ro: "ro-RO",
  ru: "ru-RU",
  sl: "sl",
  sr: "sr",
  sv: "sv-SE",
  tr: "tr-TR",
  vi: "vi-VN",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
} as const;

export type IntercomArticleLocale = keyof typeof INTERCOM_ARTICLE_LOCALE_TO_PROJECT;

const INTERCOM_FORMAL_GERMAN = "de-form";

/** Extra COMMON_LOCALES regionals that share an Intercom language-only key. */
const PROJECT_LOCALE_TO_INTERCOM_ALIASES: Record<string, string> = {
  "ar-SA": "ar",
  "cs-CZ": "cs",
  "da-DK": "da",
  "de-DE": "de",
  "el-GR": "el",
  "en-US": "en",
  "en-GB": "en",
  "en-AU": "en",
  "en-IN": "en",
  "es-ES": "es",
  "es-MX": "es",
  "fi-FI": "fi",
  "fr-FR": "fr",
  "fr-CA": "fr",
  "he-IL": "he",
  "hu-HU": "hu",
  "id-ID": "id",
  "it-IT": "it",
  "ja-JP": "ja",
  "ko-KR": "ko",
  "nb-NO": "nb",
  "nl-NL": "nl",
  "pl-PL": "pl",
  "pt-PT": "pt",
  "ro-RO": "ro",
  "ru-RU": "ru",
  "sv-SE": "sv",
  "tr-TR": "tr",
  "vi-VN": "vi",
};

const PROJECT_LOCALE_TO_INTERCOM: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(INTERCOM_ARTICLE_LOCALE_TO_PROJECT).map(([intercomLocale, projectLocale]) => [
      projectLocale,
      intercomLocale,
    ]),
  ),
  ...Object.fromEntries(
    Object.keys(INTERCOM_ARTICLE_LOCALE_TO_PROJECT).map((locale) => [locale, locale]),
  ),
  ...PROJECT_LOCALE_TO_INTERCOM_ALIASES,
};

const LOCKED_LOCALE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["pt", "pt-BR"],
  ["zh-CN", "zh-TW"],
  ["de", INTERCOM_FORMAL_GERMAN],
  ["de-DE", INTERCOM_FORMAL_GERMAN],
];

export function normalizeIntercomLocaleTag(locale: string): string {
  const normalized = locale.trim().replace(/_/g, "-");
  if (normalized.toLowerCase() === INTERCOM_FORMAL_GERMAN) {
    return INTERCOM_FORMAL_GERMAN;
  }
  return canonicalizeLocale(normalized) ?? normalized;
}

function parseIntercomLocaleParts(locale: string): { language: string; region: string | null } {
  const normalized = normalizeIntercomLocaleTag(locale);
  if (normalized === INTERCOM_FORMAL_GERMAN) {
    return { language: INTERCOM_FORMAL_GERMAN, region: null };
  }
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

export function intercomLocaleLanguage(locale: string): string {
  return parseIntercomLocaleParts(locale).language;
}

export function intercomLocalesShareLanguage(left: string, right: string): boolean {
  const leftLanguage = intercomLocaleLanguage(left);
  const rightLanguage = intercomLocaleLanguage(right);
  return Boolean(leftLanguage) && leftLanguage === rightLanguage;
}

function uniqueNonEmptyLocales(values: readonly string[]): string[] {
  const locales: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const locale = value.trim();
    if (!locale) {
      continue;
    }
    const key = normalizeIntercomLocaleTag(locale).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    locales.push(locale);
  }
  return locales;
}

function findAvailableLocale(preferred: string, available: readonly string[]): string | null {
  const normalizedPreferred = normalizeIntercomLocaleTag(preferred);
  for (const locale of available) {
    if (normalizeIntercomLocaleTag(locale) === normalizedPreferred) {
      return locale;
    }
  }
  return null;
}

function tableIntercomLocale(projectLocale: string): string | null {
  const normalized = normalizeIntercomLocaleTag(projectLocale);
  return (
    PROJECT_LOCALE_TO_INTERCOM[normalized] ??
    PROJECT_LOCALE_TO_INTERCOM[projectLocale.trim()] ??
    null
  );
}

function tableProjectLocale(intercomLocale: string): string | null {
  const normalized = normalizeIntercomLocaleTag(intercomLocale);
  const preferred =
    INTERCOM_ARTICLE_LOCALE_TO_PROJECT[normalized as IntercomArticleLocale] ??
    INTERCOM_ARTICLE_LOCALE_TO_PROJECT[intercomLocale.trim() as IntercomArticleLocale];
  return preferred ?? null;
}

function localeLockKeys(locale: string): string[] {
  const normalized = normalizeIntercomLocaleTag(locale);
  const keys = new Set([normalized]);
  const intercomKey = tableIntercomLocale(locale);
  if (intercomKey) {
    keys.add(normalizeIntercomLocaleTag(intercomKey));
  }
  const projectKey = tableProjectLocale(locale);
  if (projectKey) {
    keys.add(normalizeIntercomLocaleTag(projectKey));
  }
  return [...keys];
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

function canUseLanguageFallback(preferredLocale: string, candidateLocale: string): boolean {
  return !isLockedLocalePair(preferredLocale, candidateLocale);
}

/**
 * Maps a project locale onto an Intercom Help Center locale.
 * Prefers an exact tag, then the documented Intercom key (`es-ES` → `es`).
 * Does not map across locked regions (`en-US` ↛ `en-GB`, `zh-CN` ↛ `zh-TW`, `pt-BR` ↛ `pt`).
 */
export function resolveIntercomLocaleKey(
  preferredLocale: string,
  availableLocales: readonly string[],
): string | null {
  const available = uniqueNonEmptyLocales(availableLocales);
  if (available.length === 0) {
    return null;
  }

  const exact = findAvailableLocale(preferredLocale, available);
  if (exact) {
    return exact;
  }

  const tableKey = tableIntercomLocale(preferredLocale);
  if (tableKey) {
    const fromTable = findAvailableLocale(tableKey, available);
    if (fromTable) {
      return fromTable;
    }
  }

  const preferred = parseIntercomLocaleParts(preferredLocale);
  const sameLanguage = available.filter(
    (locale) =>
      parseIntercomLocaleParts(locale).language === preferred.language &&
      canUseLanguageFallback(preferredLocale, locale),
  );
  const languageOnly = sameLanguage.find(
    (locale) => parseIntercomLocaleParts(locale).region == null,
  );
  if (languageOnly) {
    return languageOnly;
  }

  if (preferred.region == null && sameLanguage.length === 1) {
    return sameLanguage[0] ?? null;
  }

  return null;
}

/**
 * Maps an Intercom Help Center locale onto a project locale.
 * Prefers an exact tag, then the documented project default (`es` → `es-ES`).
 */
export function resolveProjectLocaleKey(
  intercomLocale: string,
  projectLocales: readonly string[],
): string | null {
  const available = uniqueNonEmptyLocales(projectLocales);
  if (available.length === 0) {
    return null;
  }

  const exact = findAvailableLocale(intercomLocale, available);
  if (exact) {
    return exact;
  }

  const preferredProject = tableProjectLocale(intercomLocale);
  if (preferredProject) {
    const fromTable = findAvailableLocale(preferredProject, available);
    if (fromTable) {
      return fromTable;
    }
  }

  const preferred = parseIntercomLocaleParts(intercomLocale);
  const sameLanguage = available.filter(
    (locale) =>
      parseIntercomLocaleParts(locale).language === preferred.language &&
      canUseLanguageFallback(intercomLocale, locale),
  );
  if (sameLanguage.length === 1) {
    return sameLanguage[0] ?? null;
  }

  return null;
}

function pairTargetLocale(input: {
  targetLocale: string;
  projectLocales: readonly string[];
  intercomLocales: readonly string[];
}): { projectLocale: string; intercomLocale: string } | null {
  const intercomFromTarget = resolveIntercomLocaleKey(input.targetLocale, input.intercomLocales);
  const projectFromTarget = resolveProjectLocaleKey(input.targetLocale, input.projectLocales);

  if (intercomFromTarget && projectFromTarget) {
    return { projectLocale: projectFromTarget, intercomLocale: intercomFromTarget };
  }

  if (intercomFromTarget) {
    const projectLocale =
      projectFromTarget ??
      resolveProjectLocaleKey(intercomFromTarget, input.projectLocales) ??
      findAvailableLocale(input.targetLocale, input.projectLocales) ??
      input.targetLocale.trim();
    if (projectLocale) {
      return { projectLocale, intercomLocale: intercomFromTarget };
    }
  }

  if (projectFromTarget) {
    const intercomLocale = resolveIntercomLocaleKey(projectFromTarget, input.intercomLocales);
    if (intercomLocale) {
      return { projectLocale: projectFromTarget, intercomLocale };
    }
  }

  return null;
}

export function mapProjectLocalesToIntercom(input: {
  projectSourceLocale: string;
  projectTargetLocales: readonly string[];
  intercomLocales: readonly string[];
  configuredSourceLocale?: string | null;
  configuredTargetLocales?: readonly string[];
}): {
  sourceIntercomLocale: string | null;
  jobTargetLocales: string[];
  intercomTargetLocales: string[];
  unmappedProjectTargets: string[];
} {
  const projectSource = input.projectSourceLocale.trim() || "en";
  const configuredSource = input.configuredSourceLocale?.trim() || "";
  if (configuredSource && !intercomLocalesShareLanguage(configuredSource, projectSource)) {
    return {
      sourceIntercomLocale: null,
      jobTargetLocales: [],
      intercomTargetLocales: [],
      unmappedProjectTargets: [],
    };
  }

  const intercomSource = configuredSource || projectSource;
  const sourceIntercomLocale =
    resolveIntercomLocaleKey(intercomSource, input.intercomLocales) ??
    resolveIntercomLocaleKey(projectSource, input.intercomLocales);
  if (!sourceIntercomLocale) {
    return {
      sourceIntercomLocale: null,
      jobTargetLocales: [],
      intercomTargetLocales: [],
      unmappedProjectTargets: [],
    };
  }

  const projectLocales = uniqueNonEmptyLocales([projectSource, ...input.projectTargetLocales]);
  const targetInputs =
    input.configuredTargetLocales && input.configuredTargetLocales.length > 0
      ? input.configuredTargetLocales
      : input.projectTargetLocales;

  const jobTargetLocales: string[] = [];
  const intercomTargetLocales: string[] = [];
  const unmappedProjectTargets: string[] = [];
  const seenProject = new Set<string>();
  const seenIntercom = new Set<string>();

  for (const targetLocale of targetInputs) {
    const pair = pairTargetLocale({
      targetLocale,
      projectLocales,
      intercomLocales: input.intercomLocales,
    });
    if (!pair) {
      unmappedProjectTargets.push(targetLocale);
      continue;
    }
    if (
      normalizeIntercomLocaleTag(pair.intercomLocale) ===
      normalizeIntercomLocaleTag(sourceIntercomLocale)
    ) {
      continue;
    }

    const projectKey = normalizeIntercomLocaleTag(pair.projectLocale).toLowerCase();
    const intercomKey = normalizeIntercomLocaleTag(pair.intercomLocale).toLowerCase();
    if (seenProject.has(projectKey) || seenIntercom.has(intercomKey)) {
      continue;
    }
    seenProject.add(projectKey);
    seenIntercom.add(intercomKey);
    jobTargetLocales.push(pair.projectLocale);
    intercomTargetLocales.push(pair.intercomLocale);
  }

  return {
    sourceIntercomLocale,
    jobTargetLocales,
    intercomTargetLocales,
    unmappedProjectTargets,
  };
}
