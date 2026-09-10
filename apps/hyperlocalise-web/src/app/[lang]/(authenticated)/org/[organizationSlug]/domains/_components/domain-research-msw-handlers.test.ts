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

import { filterCatalogForLocale } from "@/lib/domains/research-prototype";

import { mergedResearchCatalog } from "./domain-research-msw-handlers";

describe("merged Storybook research catalog", () => {
  it("keeps each locale's keywords and ranks after filtering", () => {
    const catalog = mergedResearchCatalog("hyperlocalise-com");
    expect(catalog).not.toBeNull();

    const french = filterCatalogForLocale(catalog!, "france-fr");
    expect(french.keywords.map((keyword) => keyword.keyword)).toContain("traduction automatique");
    expect(french.ranks.map((row) => row.keyword)).toContain("traduction automatique");

    const vietnamese = filterCatalogForLocale(catalog!, "vietnam-vi");
    expect(vietnamese.keywords.map((keyword) => keyword.keyword)).toEqual(["dịch tự động"]);
    expect(vietnamese.ranks.map((row) => row.keyword)).toEqual(["dịch tự động"]);

    const german = filterCatalogForLocale(catalog!, "germany-de");
    expect(german.keywords).toEqual([]);
    expect(german.ranks).toEqual([]);
  });
});
