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
import { describe, expect, it } from "vite-plus/test";
import { filterKeywordIdeas, keywordIdeasCsv, type KeywordFilters } from "./keyword-screen";
import type { KeywordIdea } from "./research-prototype";

const filters: KeywordFilters = {
  include: "",
  exclude: "",
  minVolume: "",
  maxVolume: "",
  minKd: "",
  maxKd: "",
  minCpc: "",
  maxCpc: "",
  intent: "all",
};
const rows: KeywordIdea[] = [
  {
    id: "a",
    keyword: "Traduction API",
    volume: 100,
    kd: 20,
    cpc: 1.5,
    competition: 0,
    intent: "commercial",
  },
  { id: "b", keyword: "Traduction gratuite", volume: 500, kd: 50, cpc: 0, intent: "informational" },
  {
    id: "c",
    keyword: "Logiciel traduction API",
    volume: 300,
    kd: 30,
    cpc: 3,
    competition: 0.5,
    intent: "commercial",
  },
];
describe("keyword research table", () => {
  it("combines query, include/exclude terms, intent and inclusive ranges", () => {
    expect(
      filterKeywordIdeas(
        rows,
        "TRADUCTION",
        {
          ...filters,
          include: "traduction, api",
          exclude: "logiciel, gratuite",
          minVolume: "100",
          maxVolume: "300",
          maxKd: "20",
          minCpc: "1.5",
          intent: "commercial",
        },
        { field: "volume", direction: "desc" },
      ).map((row) => row.id),
    ).toEqual(["a"]);
  });
  it("keeps unavailable metrics last in either direction and preserves zero", () => {
    expect(
      filterKeywordIdeas(rows, "", filters, { field: "competition", direction: "asc" }).map(
        (row) => row.id,
      ),
    ).toEqual(["a", "c", "b"]);
    expect(
      filterKeywordIdeas(rows, "", filters, { field: "competition", direction: "desc" }).map(
        (row) => row.id,
      ),
    ).toEqual(["c", "a", "b"]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });
  it("returns no matches for contradictory numeric bounds", () => {
    expect(
      filterKeywordIdeas(
        rows,
        "",
        { ...filters, minVolume: "500", maxVolume: "100" },
        { field: "volume", direction: "asc" },
      ),
    ).toEqual([]);
  });
  it("exports Unicode, quotes and missing metrics without spreadsheet formulas", () => {
    const csv = keywordIdeasCsv([
      { ...rows[0]!, keyword: '=HYPERLINK("https://example.com")' },
      { ...rows[1]!, keyword: '翻訳, "API"' },
    ]);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
    expect(csv).toContain('"翻訳, ""API"""');
    expect(csv).toContain('"0","","informational"');
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});
