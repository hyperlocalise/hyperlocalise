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
import type { ProjectLocaleProgressRow } from "@/api/routes/project/project.schema";
import {
  remainingCount,
  toProgressPercent,
} from "@/lib/projects/locale-progress/project-locale-progress";

export type LocaleProgressSort = "az" | "za";
export type LocaleProgressUnit = "words" | "phrases";

export function filterAndSortLocaleProgress(
  rows: readonly ProjectLocaleProgressRow[],
  input: {
    query: string;
    sort: LocaleProgressSort;
    getLabel: (locale: string) => string;
  },
): ProjectLocaleProgressRow[] {
  const query = input.query.trim().toLowerCase();
  const filtered = query
    ? rows.filter((row) => {
        const label = input.getLabel(row.locale).toLowerCase();
        return label.includes(query) || row.locale.toLowerCase().includes(query);
      })
    : [...rows];

  const direction = input.sort === "za" ? -1 : 1;
  return filtered.toSorted((left, right) => {
    const byName = input.getLabel(left.locale).localeCompare(input.getLabel(right.locale));
    if (byName !== 0) {
      return byName * direction;
    }
    return left.locale.localeCompare(right.locale) * direction;
  });
}

export function localeProgressCounts(row: ProjectLocaleProgressRow, unit: LocaleProgressUnit) {
  return unit === "phrases" ? row.phrases : row.words;
}

export function remainingLocaleWork(
  row: ProjectLocaleProgressRow,
  unit: LocaleProgressUnit = "words",
) {
  const counts = localeProgressCounts(row, unit);
  if (counts.total === 0 && unit === "words") {
    return remainingCount(row.phrases);
  }
  return remainingCount(counts);
}

export function localeProgressPercents(row: ProjectLocaleProgressRow, unit: LocaleProgressUnit) {
  const counts = localeProgressCounts(row, unit);
  return {
    translation: toProgressPercent(counts.translated, counts.total),
    approval: toProgressPercent(counts.approved, counts.total),
  };
}

export function buildLocaleEditorHref(input: {
  stringsHref: string;
  locale: string;
  queueFilter: "untranslated" | "needs_review";
}) {
  const url = new URL(input.stringsHref, "https://hyperlocalise.local");
  url.searchParams.set("locale", input.locale);
  url.searchParams.set("queueFilter", input.queueFilter);
  return `${url.pathname}${url.search}`;
}
