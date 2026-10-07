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

/**
 * MVP: exact locale match only (no language-only fallback).
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
  const intercomSource =
    input.configuredSourceLocale?.trim() || input.projectSourceLocale.trim() || "en";
  const sourceIntercomLocale = resolveIntercomLocaleKey(intercomSource, input.intercomLocales);
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
