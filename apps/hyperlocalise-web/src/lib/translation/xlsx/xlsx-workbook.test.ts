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
import JSZip from "jszip";
import { describe, expect, it, vi } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  buildXlsxFixture,
  cellLayoutXlsxFixture,
  multilingualXlsxFixture,
} from "./xlsx-workbook.fixture";
import { checkXlsxArchiveSize, loadXlsxWorkbook, readXlsxEntries } from "./xlsx-workbook";

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

  it("reads headerless sheets by column position", async () => {
    const workbook = await load(
      buildXlsxFixture([
        {
          name: "Copy",
          cells: {
            A1: "home.title",
            B1: "Home",
            C1: "Nav label",
            D1: 12,
            A2: "home.cta",
            B2: "Start now",
          },
        },
      ]),
    );
    const entries = readXlsxEntries(workbook, "en", "en", {
      firstLineContainsHeader: false,
      columns: { identifier: 0, source: 1, context: 2, maxLength: 3 },
    });
    expect(
      entries.map(({ key, text, comment, maxLength }) => ({ key, text, comment, maxLength })),
    ).toEqual([
      { key: "home.title", text: "Home", comment: "Nav label", maxLength: 12 },
      { key: "home.cta", text: "Start now", comment: "", maxLength: 0 },
    ]);
  });

  it("rejects content that is not a workbook", async () => {
    const workbook = await loadXlsxWorkbook(new TextEncoder().encode("not a zip"));
    expect(isErr(workbook) && workbook.error).toEqual({ code: "invalid_xlsx" });
  });

  it("rejects archives whose declared unzipped size exceeds the cap", async () => {
    const loadAsync = vi.spyOn(JSZip, "loadAsync").mockResolvedValue({
      files: {
        "xl/workbook.xml": { _data: { uncompressedSize: 256 * 1024 * 1024 + 1 } },
      },
    } as never);

    try {
      const result = await checkXlsxArchiveSize(new Uint8Array([0x50, 0x4b]));
      expect(isErr(result) && result.error).toEqual({ code: "xlsx_too_large" });
    } finally {
      loadAsync.mockRestore();
    }
  });
});
