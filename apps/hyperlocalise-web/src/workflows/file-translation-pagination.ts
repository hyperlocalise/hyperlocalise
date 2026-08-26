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
export const FILE_TRANSLATION_MAX_TRANSLATIONS_PER_SESSION = 100;
export const FILE_TRANSLATION_MAX_PAGES = 500;
export const FILE_TRANSLATION_TIME_PER_KEY_LOCALE_MS = 3_000;
export const FILE_TRANSLATION_SANDBOX_OVERHEAD_MS = 2 * 60 * 1_000;
export const FILE_TRANSLATION_MIN_SANDBOX_TIMEOUT_MS = 10 * 60 * 1_000;
export const FILE_TRANSLATION_MAX_SANDBOX_TIMEOUT_MS = 24 * 60 * 60 * 1_000;

export function countPendingFileTranslations(
  sourceEntries: Record<string, string>,
  targetLocales: string[],
  prefilledByLocale: Record<string, Record<string, string>>,
): number {
  const sourceKeys = Object.keys(sourceEntries);
  return targetLocales.reduce((total, locale) => {
    const prefilled = prefilledByLocale[locale] ?? {};
    const pendingForLocale = sourceKeys.filter((key) => !(key in prefilled)).length;
    return total + pendingForLocale;
  }, 0);
}

export function calculateFileTranslationSandboxTimeoutMs(translationCount: number): number {
  const normalizedTranslationCount = Math.max(0, Math.floor(translationCount));
  const workloadTimeoutMs =
    normalizedTranslationCount * FILE_TRANSLATION_TIME_PER_KEY_LOCALE_MS +
    FILE_TRANSLATION_SANDBOX_OVERHEAD_MS;

  return Math.min(
    FILE_TRANSLATION_MAX_SANDBOX_TIMEOUT_MS,
    Math.max(FILE_TRANSLATION_MIN_SANDBOX_TIMEOUT_MS, workloadTimeoutMs),
  );
}

/** Parse `deferred_by_limit=N` from `hl run` stdout. Missing marker means 0. */
export function parseDeferredByLimit(output: string): number {
  const match = /\bdeferred_by_limit=(\d+)\b/.exec(output);
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[1] ?? "0", 10) || 0;
}
