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
import * as XLSX from "xlsx";
import { describe, expect, it } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import { convertXlsToXlsx, spreadsheetXlsxContent } from "./xls-workbook";
import { loadXlsxWorkbook, readXlsxEntries } from "./xlsx-workbook";

function xlsFixture(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Key", "English", "French"],
      ["home.title", "Home", ""],
      ["home.year", 2026, ""],
    ]),
    "Strings",
  );
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "biff8" }) as ArrayBuffer);
}

describe("convertXlsToXlsx", () => {
  it("keys converted workbooks with the xlsx rules", async () => {
    const converted = convertXlsToXlsx(xlsFixture());
    if (!isOk(converted)) throw new Error("conversion failed");

    const workbook = await loadXlsxWorkbook(converted.value);
    if (!isOk(workbook)) throw new Error("load failed");
    expect(
      readXlsxEntries(workbook.value, "en", "en").map((entry) => [entry.key, entry.text]),
    ).toEqual([["home.title", "Home"]]);
  });

  it("converts the same workbook to the same bytes", () => {
    const first = convertXlsToXlsx(xlsFixture());
    const second = convertXlsToXlsx(xlsFixture());
    expect(isOk(first) && isOk(second) && Buffer.compare(first.value, second.value)).toBe(0);
  });

  it("rejects content that is not a binary workbook", () => {
    for (const content of [
      new TextEncoder().encode("Key,English\nhome.title,Home\n"),
      new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2, 3]),
    ]) {
      const result = convertXlsToXlsx(content);
      expect(isErr(result) && result.error.code).toBe("invalid_xlsx");
    }
  });

  it("converts by content so either format reads as xlsx", () => {
    const zipped = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const passthrough = spreadsheetXlsxContent(zipped);
    expect(isOk(passthrough) && passthrough.value).toBe(zipped);

    const converted = spreadsheetXlsxContent(xlsFixture());
    expect(isOk(converted) && Array.from(converted.value.slice(0, 2))).toEqual([0x50, 0x4b]);
  });
});
