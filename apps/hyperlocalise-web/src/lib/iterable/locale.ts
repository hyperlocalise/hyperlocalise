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

export function normalizeIterableLocaleTag(locale: string): string {
  const normalized = locale.trim().replace(/_/g, "-");
  return canonicalizeLocale(normalized) ?? normalized;
}

function parseLocaleParts(locale: string): { language: string; region: string | null } {
  const normalized = normalizeIterableLocaleTag(locale);
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
    const key = normalizeIterableLocaleTag(locale).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    locales.push(locale);
  }
  return locales;
}

function localeLockKeys(locale: string): string[] {
  const normalized = normalizeIterableLocaleTag(locale);
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

export function iterableLocalesShareLanguage(left: string, right: string): boolean {
  const leftLanguage = parseLocaleParts(left).language;
  const rightLanguage = parseLocaleParts(right).language;
  return Boolean(leftLanguage) && leftLanguage === rightLanguage;
}

export function areIterableSourceLocalesCompatible(left: string, right: string): boolean {
  return iterableLocalesShareLanguage(left, right) && !isLockedLocalePair(left, right);
}

/**
 * Locale suffix written onto Customer.io locale copies (`Newsletter_fr-FR`).
 */
export function resolveIterableLocaleSuffix(projectLocale: string): string {
  return normalizeIterableLocaleTag(projectLocale);
}

export type IterableLocaleIdentity = {
  id: string;
  name?: string;
  locale?: string;
};

export function resolveIterableLocaleId(
  projectLocale: string,
  iterableLocales: readonly IterableLocaleIdentity[],
): string | null {
  const normalized = normalizeIterableLocaleTag(projectLocale).toLowerCase();
  if (!normalized) {
    return null;
  }
  for (const locale of iterableLocales) {
    const id = locale.id.trim();
    if (!id) {
      continue;
    }
    const name = locale.name?.trim() ? normalizeIterableLocaleTag(locale.name).toLowerCase() : "";
    const key = locale.locale?.trim()
      ? normalizeIterableLocaleTag(locale.locale).toLowerCase()
      : "";
    if (name === normalized || key === normalized || id.toLowerCase() === normalized) {
      return id;
    }
  }
  return null;
}

export function mapProjectLocalesToIterableLocaleIds(input: {
  projectLocales: readonly string[];
  iterableLocales: readonly IterableLocaleIdentity[];
}): {
  localeIds: Record<string, string>;
  unmappedProjectLocales: string[];
} {
  const localeIds: Record<string, string> = {};
  const unmappedProjectLocales: string[] = [];
  const seenId = new Set<string>();
  for (const projectLocale of uniqueNonEmptyLocales(input.projectLocales)) {
    const id = resolveIterableLocaleId(projectLocale, input.iterableLocales);
    if (!id || seenId.has(id)) {
      unmappedProjectLocales.push(projectLocale);
      continue;
    }
    seenId.add(id);
    localeIds[projectLocale] = id;
  }
  return { localeIds, unmappedProjectLocales };
}

export function mapProjectLocalesToIterable(input: {
  projectSourceLocale: string;
  projectTargetLocales: readonly string[];
  configuredSourceLocale?: string | null;
  configuredTargetLocales?: readonly string[];
}): {
  sourceSuffix: string | null;
  jobTargetLocales: string[];
  iterableSuffixes: string[];
  unmappedProjectTargets: string[];
} {
  const projectSource = input.projectSourceLocale.trim() || "en";
  const configuredSource = input.configuredSourceLocale?.trim() || "";
  if (configuredSource && !areIterableSourceLocalesCompatible(configuredSource, projectSource)) {
    return {
      sourceSuffix: null,
      jobTargetLocales: [],
      iterableSuffixes: [],
      unmappedProjectTargets: [],
    };
  }

  const sourceSuffix = resolveIterableLocaleSuffix(configuredSource || projectSource);
  const targetInputs =
    input.configuredTargetLocales && input.configuredTargetLocales.length > 0
      ? input.configuredTargetLocales
      : input.projectTargetLocales;

  const jobTargetLocales: string[] = [];
  const iterableSuffixes: string[] = [];
  const unmappedProjectTargets: string[] = [];
  const seenProject = new Set<string>();
  const seenSuffix = new Set<string>();

  for (const targetLocale of uniqueNonEmptyLocales(targetInputs)) {
    const suffix = resolveIterableLocaleSuffix(targetLocale);
    if (!suffix) {
      unmappedProjectTargets.push(targetLocale);
      continue;
    }
    if (normalizeIterableLocaleTag(suffix) === normalizeIterableLocaleTag(sourceSuffix)) {
      continue;
    }
    const projectKey = normalizeIterableLocaleTag(targetLocale).toLowerCase();
    const suffixKey = normalizeIterableLocaleTag(suffix).toLowerCase();
    if (seenProject.has(projectKey) || seenSuffix.has(suffixKey)) {
      continue;
    }
    seenProject.add(projectKey);
    seenSuffix.add(suffixKey);
    jobTargetLocales.push(targetLocale);
    iterableSuffixes.push(suffix);
  }

  return {
    sourceSuffix,
    jobTargetLocales,
    iterableSuffixes,
    unmappedProjectTargets,
  };
}
