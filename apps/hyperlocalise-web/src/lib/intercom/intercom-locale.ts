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

export function normalizeIntercomLocaleTag(locale: string): string {
  const normalized = locale.trim().replace(/_/g, "-");
  return canonicalizeLocale(normalized) ?? normalized;
}

function parseIntercomLocaleParts(locale: string): { language: string; region: string | null } {
  const normalized = normalizeIntercomLocaleTag(locale);
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

/**
 * Maps a project locale onto an Intercom Help Center locale.
 * Prefers an exact tag, then the language-only Intercom locale (`en-US` → `en`).
 * Does not map across regions (`en-US` ↛ `en-GB`, `zh-CN` ↛ `zh-TW`).
 */
export function resolveIntercomLocaleKey(
  preferredLocale: string,
  availableLocales: readonly string[],
): string | null {
  const available = [...new Set(availableLocales.filter((locale) => locale.trim().length > 0))];
  if (available.length === 0) {
    return null;
  }

  const normalizedPreferred = normalizeIntercomLocaleTag(preferredLocale);
  for (const locale of available) {
    if (normalizeIntercomLocaleTag(locale) === normalizedPreferred) {
      return locale;
    }
  }

  const preferred = parseIntercomLocaleParts(preferredLocale);
  const sameLanguage = available.filter(
    (locale) => parseIntercomLocaleParts(locale).language === preferred.language,
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

  const projectTargets =
    input.configuredTargetLocales && input.configuredTargetLocales.length > 0
      ? input.configuredTargetLocales
      : input.projectTargetLocales;

  const jobTargetLocales: string[] = [];
  const intercomTargetLocales: string[] = [];
  const unmappedProjectTargets: string[] = [];

  for (const hlTarget of projectTargets) {
    const intercomTarget = resolveIntercomLocaleKey(hlTarget, input.intercomLocales);
    if (!intercomTarget) {
      unmappedProjectTargets.push(hlTarget);
      continue;
    }
    if (
      normalizeIntercomLocaleTag(intercomTarget) ===
      normalizeIntercomLocaleTag(sourceIntercomLocale)
    ) {
      continue;
    }
    if (!jobTargetLocales.includes(hlTarget)) {
      jobTargetLocales.push(hlTarget);
    }
    if (!intercomTargetLocales.includes(intercomTarget)) {
      intercomTargetLocales.push(intercomTarget);
    }
  }

  return {
    sourceIntercomLocale,
    jobTargetLocales,
    intercomTargetLocales,
    unmappedProjectTargets,
  };
}
