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

export function normalizeCustomerIoLocaleTag(locale: string): string {
  const normalized = locale.trim().replace(/_/g, "-");
  return canonicalizeLocale(normalized) ?? normalized;
}

function parseLocaleParts(locale: string): { language: string; region: string | null } {
  const normalized = normalizeCustomerIoLocaleTag(locale);
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
    const key = normalizeCustomerIoLocaleTag(locale).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    locales.push(locale);
  }
  return locales;
}

function localeLockKeys(locale: string): string[] {
  const normalized = normalizeCustomerIoLocaleTag(locale);
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

export function customerIoLocalesShareLanguage(left: string, right: string): boolean {
  const leftLanguage = parseLocaleParts(left).language;
  const rightLanguage = parseLocaleParts(right).language;
  return Boolean(leftLanguage) && leftLanguage === rightLanguage;
}

export function areCustomerIoSourceLocalesCompatible(left: string, right: string): boolean {
  return customerIoLocalesShareLanguage(left, right) && !isLockedLocalePair(left, right);
}

/**
 * Locale suffix written onto Customer.io locale copies (`Newsletter_fr-FR`).
 */
export function resolveCustomerIoLocaleSuffix(projectLocale: string): string {
  return normalizeCustomerIoLocaleTag(projectLocale);
}

export type CustomerIoLocaleIdentity = {
  id: string;
  name?: string;
  locale?: string;
};

export function resolveCustomerIoLocaleId(
  projectLocale: string,
  customerIoLocales: readonly CustomerIoLocaleIdentity[],
): string | null {
  const normalized = normalizeCustomerIoLocaleTag(projectLocale).toLowerCase();
  if (!normalized) {
    return null;
  }
  for (const locale of customerIoLocales) {
    const id = locale.id.trim();
    if (!id) {
      continue;
    }
    const name = locale.name?.trim() ? normalizeCustomerIoLocaleTag(locale.name).toLowerCase() : "";
    const key = locale.locale?.trim()
      ? normalizeCustomerIoLocaleTag(locale.locale).toLowerCase()
      : "";
    if (name === normalized || key === normalized || id.toLowerCase() === normalized) {
      return id;
    }
  }
  return null;
}

export function mapProjectLocalesToCustomerIoLocaleIds(input: {
  projectLocales: readonly string[];
  customerIoLocales: readonly CustomerIoLocaleIdentity[];
}): {
  localeIds: Record<string, string>;
  unmappedProjectLocales: string[];
} {
  const localeIds: Record<string, string> = {};
  const unmappedProjectLocales: string[] = [];
  const seenId = new Set<string>();
  for (const projectLocale of uniqueNonEmptyLocales(input.projectLocales)) {
    const id = resolveCustomerIoLocaleId(projectLocale, input.customerIoLocales);
    if (!id || seenId.has(id)) {
      unmappedProjectLocales.push(projectLocale);
      continue;
    }
    seenId.add(id);
    localeIds[projectLocale] = id;
  }
  return { localeIds, unmappedProjectLocales };
}

export function mapProjectLocalesToCustomerIo(input: {
  projectSourceLocale: string;
  projectTargetLocales: readonly string[];
  configuredSourceLocale?: string | null;
  configuredTargetLocales?: readonly string[];
}): {
  sourceSuffix: string | null;
  jobTargetLocales: string[];
  customerIoSuffixes: string[];
  unmappedProjectTargets: string[];
} {
  const projectSource = input.projectSourceLocale.trim() || "en";
  const configuredSource = input.configuredSourceLocale?.trim() || "";
  if (configuredSource && !areCustomerIoSourceLocalesCompatible(configuredSource, projectSource)) {
    return {
      sourceSuffix: null,
      jobTargetLocales: [],
      customerIoSuffixes: [],
      unmappedProjectTargets: [],
    };
  }

  const sourceSuffix = resolveCustomerIoLocaleSuffix(configuredSource || projectSource);
  const targetInputs =
    input.configuredTargetLocales && input.configuredTargetLocales.length > 0
      ? input.configuredTargetLocales
      : input.projectTargetLocales;

  const jobTargetLocales: string[] = [];
  const customerIoSuffixes: string[] = [];
  const unmappedProjectTargets: string[] = [];
  const seenProject = new Set<string>();
  const seenSuffix = new Set<string>();

  for (const targetLocale of uniqueNonEmptyLocales(targetInputs)) {
    const suffix = resolveCustomerIoLocaleSuffix(targetLocale);
    if (!suffix) {
      unmappedProjectTargets.push(targetLocale);
      continue;
    }
    if (normalizeCustomerIoLocaleTag(suffix) === normalizeCustomerIoLocaleTag(sourceSuffix)) {
      continue;
    }
    const projectKey = normalizeCustomerIoLocaleTag(targetLocale).toLowerCase();
    const suffixKey = normalizeCustomerIoLocaleTag(suffix).toLowerCase();
    if (seenProject.has(projectKey) || seenSuffix.has(suffixKey)) {
      continue;
    }
    seenProject.add(projectKey);
    seenSuffix.add(suffixKey);
    jobTargetLocales.push(targetLocale);
    customerIoSuffixes.push(suffix);
  }

  return {
    sourceSuffix,
    jobTargetLocales,
    customerIoSuffixes,
    unmappedProjectTargets,
  };
}
