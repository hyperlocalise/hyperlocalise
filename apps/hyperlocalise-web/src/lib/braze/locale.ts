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
  return [...new Set([normalized, locale.trim()])];
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
 * Locale suffix written onto Braze library copies (`Template_Name_fr-FR`).
 */
export function resolveBrazeLocaleSuffix(projectLocale: string): string {
  return normalizeBrazeLocaleTag(projectLocale);
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

const BRAZE_LOCALE_SHAPED_SUFFIX =
  /_([A-Za-z]{2,3})(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?$/;

export function isBrazeLocaleShapedCopyName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  return BRAZE_LOCALE_SHAPED_SUFFIX.test(trimmed);
}

export function isBrazeLocaleCopyName(input: {
  name: string;
  suffixes: readonly string[];
}): boolean {
  const name = input.name.trim();
  if (!name) {
    return false;
  }
  if (
    input.suffixes.some((suffix) => {
      const token = suffix.trim();
      if (!token) {
        return false;
      }
      return name.endsWith(`_${token}`) || name.toLowerCase().endsWith(`_${token.toLowerCase()}`);
    })
  ) {
    return true;
  }
  return isBrazeLocaleShapedCopyName(name);
}
