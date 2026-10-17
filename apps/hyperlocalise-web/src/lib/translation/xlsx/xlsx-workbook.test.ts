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

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  buildXlsxFixture,
  cellLayoutXlsxFixture,
  multilingualXlsxFixture,
} from "./xlsx-workbook.fixture";
import { loadXlsxWorkbook, readXlsxEntries } from "./xlsx-workbook";

async function load(content: Uint8Array) {
  const workbook = await loadXlsxWorkbook(content);
  if (!isOk(workbook)) {
    throw new Error(`expected a workbook, got ${JSON.stringify(workbook.error)}`);
  }
  return workbook.value;
}

describe("readXlsxEntries", () => {
  it("keeps fallback row keys distinct from literal keys", async () => {
    const workbook = await load(
      buildXlsxFixture([
        {
          name: "Strings",
          cells: {
            A1: "Key",
            B1: "English",
            A2: "Strings!3:3",
            B2: "Literal",
            B3: "Empty key",
            A4: "Strings!3:3",
            B4: "Duplicate key",
          },
        },
      ]),
    );
    expect(readXlsxEntries(workbook, "en", "en").map((entry) => entry.key)).toEqual([
      "Strings!3:3",
      "Strings!3:3#2",
      "Strings!4:4",
    ]);
  });

  it.each([false, true])(
    "reads multilingual rows with key, comment, and length columns (shared strings: %s)",
    async (sharedStrings) => {
      const workbook = await load(multilingualXlsxFixture({ sharedStrings }));
      expect(readXlsxEntries(workbook, "en-US", "en-US")).toEqual([
        {
          key: "home.title",
          text: "Home",
          sheet: "Strings",
          cell: "D2",
          comment: "Navigation label",
          maxLength: 12,
        },
        {
          key: "home.cta",
          text: "Start free trial",
          sheet: "Strings",
          cell: "D3",
          comment: "",
          maxLength: 0,
        },
        {
          key: "Strings!4:4",
          text: "Home again",
          sheet: "Strings",
          cell: "D4",
          comment: "",
          maxLength: 0,
        },
        {
          key: "Strings!5:5",
          text: "No key here",
          sheet: "Strings",
          cell: "D5",
          comment: "",
          maxLength: 0,
        },
      ]);
    },
  );

  it("reads a target column with the source row keys", async () => {
    const workbook = await load(multilingualXlsxFixture());
    expect(readXlsxEntries(workbook, "en", "fr-FR").map(({ key, text }) => [key, text])).toEqual([
      ["home.title", "Accueil"],
    ]);
    expect(readXlsxEntries(workbook, "en", "es")).toEqual([]);
  });

  it("reads every text cell when row 1 has no source column, skipping hidden sheets", async () => {
    const workbook = await load(cellLayoutXlsxFixture());
    expect(readXlsxEntries(workbook, "en", "en").map(({ key, text }) => [key, text])).toEqual([
      ["Pricing!A1", "Plan"],
      ["Pricing!B1", "Price"],
      ["Pricing!A2", "Starter"],
      ["Pricing!C4", "Billed yearly"],
    ]);
  });

  it("rejects content that is not a workbook", async () => {
    const workbook = await loadXlsxWorkbook(new TextEncoder().encode("not a zip"));
    expect(isErr(workbook) && workbook.error).toEqual({ code: "invalid_xlsx" });
  });
});
