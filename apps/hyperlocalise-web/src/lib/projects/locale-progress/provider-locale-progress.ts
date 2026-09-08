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
import {
  buildLocaleProgressRow,
  emptyLocaleProgressRow,
  emptyProgressCounts,
  findLocaleProgressRecord,
  toProgressPercent,
  type ProjectLocaleProgressCounts,
  type ProjectLocaleProgressRow,
} from "./project-locale-progress";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asIsoTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readCountBucket(value: unknown): ProjectLocaleProgressCounts | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const total = asFiniteNumber(record.total);
  if (total === null) {
    return null;
  }

  return {
    total: Math.max(0, Math.round(total)),
    translated: Math.max(0, Math.round(asFiniteNumber(record.translated) ?? 0)),
    approved: Math.max(0, Math.round(asFiniteNumber(record.approved) ?? 0)),
  };
}

function readSmartlingCounts(record: Record<string, unknown>): {
  phrases: ProjectLocaleProgressCounts;
  lastActivityAt: string | null;
} | null {
  const translated = asFiniteNumber(record.completedStringCount);
  const authorized = asFiniteNumber(record.authorizedStringCount);
  if (translated === null && authorized === null) {
    return null;
  }

  const total = Math.max(0, Math.round(authorized ?? translated ?? 0));
  const done = Math.max(0, Math.round(translated ?? 0));

  return {
    phrases: {
      total,
      translated: done,
      approved: 0,
    },
    lastActivityAt: asIsoTimestamp(record.lastCompleted) ?? asIsoTimestamp(record.lastAuthorized),
  };
}

function isLocaleReadinessMap(value: Record<string, unknown>) {
  return Object.values(value).some((entry) => asRecord(entry) !== null);
}

export function normalizeProviderLocaleProgress(input: {
  targetLocales: readonly string[];
  readiness: Record<string, unknown> | null;
}): ProjectLocaleProgressRow[] {
  const readiness = input.readiness ?? {};
  const readinessMap = isLocaleReadinessMap(readiness) ? readiness : {};
  const usedKeys = new Set<string>();
  const rows: ProjectLocaleProgressRow[] = [];

  for (const locale of input.targetLocales) {
    const match = findLocaleProgressRecord(readinessMap, locale);
    if (!match) {
      rows.push(emptyLocaleProgressRow(locale));
      continue;
    }

    usedKeys.add(match.key);
    rows.push(normalizeProviderLocaleProgressEntry(locale, match.value));
  }

  for (const [locale, value] of Object.entries(readinessMap)) {
    if (usedKeys.has(locale)) {
      continue;
    }

    rows.push(normalizeProviderLocaleProgressEntry(locale, value));
  }

  return rows;
}

export function normalizeProviderLocaleProgressEntry(
  locale: string,
  value: unknown,
): ProjectLocaleProgressRow {
  const record = asRecord(value);
  if (!record) {
    return emptyLocaleProgressRow(locale);
  }

  const words = readCountBucket(record.words);
  const phrases = readCountBucket(record.phrases);
  const smartling = readSmartlingCounts(record);
  const translationProgress = asFiniteNumber(record.translationProgress);
  const approvalProgress = asFiniteNumber(record.approvalProgress);
  const resolvedCounts = words ?? phrases ?? smartling?.phrases ?? emptyProgressCounts();

  return buildLocaleProgressRow({
    locale,
    words: words ?? resolvedCounts,
    phrases: phrases ?? resolvedCounts,
    lastActivityAt: smartling?.lastActivityAt ?? null,
    translationProgress:
      translationProgress ?? toProgressPercent(resolvedCounts.translated, resolvedCounts.total),
    approvalProgress:
      approvalProgress ?? toProgressPercent(resolvedCounts.approved, resolvedCounts.total),
  });
}
