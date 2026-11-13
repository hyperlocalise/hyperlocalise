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

type FixtureCell = string | number | { formula: string; cached: string | number };

type FixtureSheet = {
  name: string;
  cells: Record<string, FixtureCell>;
  hidden?: boolean;
  columnWidths?: number[];
};

/** Builds a workbook the way spreadsheet exports do, so tests stay byte-free. */
export function buildXlsxFixture(
  sheets: FixtureSheet[],
  options: { sharedStrings?: boolean } = {},
) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet: XLSX.WorkSheet = {};
    const range = { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    for (const [address, cell] of Object.entries(sheet.cells)) {
      const { r, c } = XLSX.utils.decode_cell(address);
      range.e.r = Math.max(range.e.r, r);
      range.e.c = Math.max(range.e.c, c);
      if (typeof cell === "object") {
        worksheet[address] = {
          t: typeof cell.cached === "number" ? "n" : "s",
          v: cell.cached,
          f: cell.formula,
        };
      } else {
        worksheet[address] = { t: typeof cell === "number" ? "n" : "s", v: cell };
      }
    }
    worksheet["!ref"] = XLSX.utils.encode_range(range);
    if (sheet.columnWidths) {
      worksheet["!cols"] = sheet.columnWidths.map((wch) => ({ wch }));
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  workbook.Workbook = { Sheets: sheets.map((sheet) => ({ Hidden: sheet.hidden ? 1 : 0 })) };
  return new Uint8Array(
    XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
      bookSST: options.sharedStrings ?? false,
    }) as ArrayBuffer,
  );
}

export function multilingualXlsxFixture(options: { sharedStrings?: boolean } = {}) {
  return buildXlsxFixture(
    [
      {
        name: "Strings",
        columnWidths: [12, 20, 20, 40],
        cells: {
          A1: "Key",
          B1: "French",
          C1: "de-DE",
          D1: "English",
          E1: "Comment",
          F1: "String length",
          A2: "home.title",
          B2: "Accueil",
          D2: "Home",
          E2: "Navigation label",
          F2: 12,
          A3: "home.cta",
          D3: "Start free trial",
          A4: "home.title",
          D4: "Home again",
          D5: "No key here",
          A6: "price",
          D6: 42,
          A7: "total",
          D7: { formula: 'CONCAT("To","tal")', cached: "Total" },
        },
      },
    ],
    options,
  );
}

export function cellLayoutXlsxFixture() {
  return buildXlsxFixture([
    {
      name: "Pricing",
      cells: {
        A1: "Plan",
        B1: "Price",
        A2: "Starter",
        B2: 9,
        A3: "—",
        B3: { formula: "B2*2", cached: 18 },
        C4: "Billed yearly",
      },
    },
    { name: "Lookup", hidden: true, cells: { A1: "Hidden text" } },
  ]);
}
