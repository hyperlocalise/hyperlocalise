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

export type ProjectLocaleProgressCounts = {
  total: number;
  translated: number;
  approved: number;
};

export type ProjectLocaleProgressRow = {
  locale: string;
  translationProgress: number;
  approvalProgress: number;
  words: ProjectLocaleProgressCounts;
  phrases: ProjectLocaleProgressCounts;
  lastActivityAt: string | null;
};

export function toProgressPercent(completed: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export function emptyProgressCounts(): ProjectLocaleProgressCounts {
  return { total: 0, translated: 0, approved: 0 };
}

export function remainingCount(counts: ProjectLocaleProgressCounts) {
  return Math.max(0, counts.total - counts.translated);
}

export function localeBadgeCode(locale: string) {
  const canonical = canonicalizeLocale(locale) ?? locale.trim();
  const language = canonical.split("-")[0] ?? canonical;
  return language.slice(0, 3).toUpperCase();
}

export function buildLocaleProgressRow(input: {
  locale: string;
  words: ProjectLocaleProgressCounts;
  phrases: ProjectLocaleProgressCounts;
  lastActivityAt?: string | null;
  translationProgress?: number;
  approvalProgress?: number;
}): ProjectLocaleProgressRow {
  return {
    locale: input.locale,
    translationProgress:
      input.translationProgress ?? toProgressPercent(input.words.translated, input.words.total),
    approvalProgress:
      input.approvalProgress ?? toProgressPercent(input.words.approved, input.words.total),
    words: input.words,
    phrases: input.phrases,
    lastActivityAt: input.lastActivityAt ?? null,
  };
}

export function emptyLocaleProgressRow(locale: string): ProjectLocaleProgressRow {
  return buildLocaleProgressRow({
    locale,
    words: emptyProgressCounts(),
    phrases: emptyProgressCounts(),
  });
}

function localeMatchKey(locale: string) {
  return (canonicalizeLocale(locale) ?? locale).trim().toLowerCase();
}

export function findLocaleProgressRecord<T>(
  records: Record<string, T>,
  locale: string,
): { key: string; value: T } | undefined {
  const exact = records[locale];
  if (exact !== undefined) {
    return { key: locale, value: exact };
  }

  const wanted = localeMatchKey(locale);
  for (const [key, value] of Object.entries(records)) {
    if (localeMatchKey(key) === wanted) {
      return { key, value };
    }
  }

  const language = wanted.split("-")[0];
  if (!language) {
    return undefined;
  }

  for (const [key, value] of Object.entries(records)) {
    const candidate = localeMatchKey(key);
    if (candidate === language || candidate.startsWith(`${language}-`)) {
      return { key, value };
    }
  }

  return undefined;
}
