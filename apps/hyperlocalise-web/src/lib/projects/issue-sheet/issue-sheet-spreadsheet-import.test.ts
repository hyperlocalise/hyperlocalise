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

import { parseIssueSheetImportCsv } from "./issue-sheet-csv-import";
import { issueSheetImportFormatFromFilename } from "./issue-sheet-import-format";
import {
  parseIssueSheetImportWorkbook,
  serializeIssueSheetImportCsv,
} from "./issue-sheet-spreadsheet-import";

function workbookBytes(rows: unknown[][], bookType: "xls" | "xlsx", sheetName = "Issues") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType }));
}

describe("issue-sheet-spreadsheet-import", () => {
  it("detects csv, xls, and xlsx from the filename", () => {
    expect(issueSheetImportFormatFromFilename("rows.CSV")).toBe("csv");
    expect(issueSheetImportFormatFromFilename("legacy.XLS")).toBe("xls");
    expect(issueSheetImportFormatFromFilename("modern.XLSX")).toBe("xlsx");
    expect(issueSheetImportFormatFromFilename("notes.txt")).toBeNull();
  });

  it("parses xlsx headers and rows, then round-trips through CSV", () => {
    const parsed = parseIssueSheetImportWorkbook(
      workbookBytes(
        [
          ["Summary", "Status", "Notes"],
          ["Fix CTA, primary", "Open", 'He said "ship it"'],
          ["", "", ""],
          ["Update glossary term", "Done", "Line one\nline two"],
        ],
        "xlsx",
      ),
    );

    expect(parsed.headers).toEqual(["Summary", "Status", "Notes"]);
    expect(parsed.rows).toEqual([
      ["Fix CTA, primary", "Open", 'He said "ship it"'],
      ["Update glossary term", "Done", "Line one\nline two"],
    ]);
    expect(parseIssueSheetImportCsv(serializeIssueSheetImportCsv(parsed.headers, parsed.rows))).toEqual(
      parsed,
    );
  });

  it("parses xls workbooks", () => {
    const parsed = parseIssueSheetImportWorkbook(
      workbookBytes(
        [
          ["Title", "Status"],
          ["Broken checkout", "In Progress"],
        ],
        "xls",
      ),
    );

    expect(parsed).toEqual({
      headers: ["Title", "Status"],
      rows: [["Broken checkout", "In Progress"]],
    });
  });

  it("uses the first visible sheet that has data", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[], []]), "Empty");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Title"],
        ["Use the filled sheet"],
      ]),
      "Queries",
    );
    const parsed = parseIssueSheetImportWorkbook(
      new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" })),
    );

    expect(parsed).toEqual({
      headers: ["Title"],
      rows: [["Use the filled sheet"]],
    });
  });

  it("rejects malformed workbooks", () => {
    expect(() => parseIssueSheetImportWorkbook(Uint8Array.from([1, 2, 3, 4]))).toThrow(
      "issue_sheet_import_invalid_spreadsheet",
    );
    expect(() => parseIssueSheetImportWorkbook(Uint8Array.from(Buffer.from("not an xlsx")))).toThrow(
      "issue_sheet_import_invalid_spreadsheet",
    );
  });
});
