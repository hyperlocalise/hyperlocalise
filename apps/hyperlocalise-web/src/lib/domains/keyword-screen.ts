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
import type { KeywordIdea } from "./research-prototype";

export type KeywordFilters = Record<
  | "include"
  | "exclude"
  | "minVolume"
  | "maxVolume"
  | "minKd"
  | "maxKd"
  | "minCpc"
  | "maxCpc"
  | "intent",
  string
>;
export type KeywordSort = {
  field: "keyword" | "volume" | "kd" | "cpc" | "competition";
  direction: "asc" | "desc";
};

export function filterKeywordIdeas(
  rows: KeywordIdea[],
  query: string,
  filters: KeywordFilters,
  sort: KeywordSort,
) {
  const terms = (text: string) =>
    text
      .toLocaleLowerCase()
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
  const include = terms(filters.include);
  const exclude = terms(filters.exclude);
  return rows
    .filter((row) => {
      const keyword = row.keyword.toLocaleLowerCase();
      if (
        !keyword.includes(query.trim().toLocaleLowerCase()) ||
        !include.every((term) => keyword.includes(term)) ||
        exclude.some((term) => keyword.includes(term))
      )
        return false;
      if (filters.intent !== "all" && row.intent !== filters.intent) return false;
      return (
        [
          ["volume", "minVolume", "maxVolume"],
          ["kd", "minKd", "maxKd"],
          ["cpc", "minCpc", "maxCpc"],
        ] as const
      ).every(
        ([field, min, max]) =>
          (filters[min] === "" || row[field] >= Number(filters[min])) &&
          (filters[max] === "" || row[field] <= Number(filters[max])),
      );
    })
    .sort((a, b) => {
      const left = a[sort.field],
        right = b[sort.field];
      if (left == null) return right == null ? 0 : 1;
      if (right == null) return -1;
      const order =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right)
          : Number(left) - Number(right);
      return sort.direction === "asc" ? order : -order;
    });
}

export function keywordIdeasCsv(rows: KeywordIdea[]) {
  const cell = (value: string | number | undefined) => {
    let text = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    ["Keyword", "Volume", "KD", "CPC (EUR)", "Competition", "Intent"],
    ...rows.map((row) => [row.keyword, row.volume, row.kd, row.cpc, row.competition, row.intent]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}

export function resolveActiveKeyword(rows: KeywordIdea[], activeId: string | null) {
  return rows.find((row) => row.id === activeId) ?? rows[0] ?? null;
}
