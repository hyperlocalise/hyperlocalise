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

import { filterDictionaryListRows, type DictionaryListRow } from "./dictionary-list";

const dictionaries: DictionaryListRow[] = [
  {
    id: "1",
    name: "Brand names",
    description: "Accepted product tokens",
    status: "active",
    wordsVersion: 2,
    wordCount: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "2",
    name: "Legal",
    description: "Court names",
    status: "archived",
    wordsVersion: 1,
    wordCount: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
];

describe("filterDictionaryListRows", () => {
  it("filters by name or description", () => {
    expect(filterDictionaryListRows(dictionaries, "brand").map((row) => row.id)).toEqual(["1"]);
    expect(filterDictionaryListRows(dictionaries, "court").map((row) => row.id)).toEqual(["2"]);
    expect(filterDictionaryListRows(dictionaries, "")).toHaveLength(2);
  });
});
