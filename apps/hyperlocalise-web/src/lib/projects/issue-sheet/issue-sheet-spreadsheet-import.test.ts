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
import * as XLSX from "xlsx";
import { describe, expect, it } from "vite-plus/test";

import { ISSUE_SHEET_IMPORT_MAX_ROWS, parseIssueSheetImportCsv } from "./issue-sheet-csv-import";
import { issueSheetImportFormatFromFilename } from "./issue-sheet-import-format";
import {
  ISSUE_SHEET_IMPORT_MAX_DECODE_COLUMNS,
  ISSUE_SHEET_IMPORT_MAX_DECODE_ROWS,
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
    expect(
      parseIssueSheetImportCsv(serializeIssueSheetImportCsv(parsed.headers, parsed.rows)),
    ).toEqual(parsed);
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
      XLSX.utils.aoa_to_sheet([["Title"], ["Use the filled sheet"]]),
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
    expect(() =>
      parseIssueSheetImportWorkbook(Uint8Array.from(Buffer.from("not an xlsx"))),
    ).toThrow("issue_sheet_import_invalid_spreadsheet");
  });

  it("rejects serialized spreadsheet CSV that exceeds the byte limit", () => {
    expect(() =>
      serializeIssueSheetImportCsv(
        ["Title", "Notes"],
        Array.from({ length: 80 }, () => ["Fix CTA", "y".repeat(40_000)]),
      ),
    ).toThrow("issue_sheet_import_file_too_large");
  });

  it("rejects workbooks whose used range exceeds the decode row bound", () => {
    const overflowRows = ISSUE_SHEET_IMPORT_MAX_DECODE_ROWS + 1;
    expect(() =>
      parseIssueSheetImportWorkbook(
        workbookBytes(
          [
            ["Title"],
            ...Array.from({ length: overflowRows - 1 }, (_, index) => [`Row ${index + 1}`]),
          ],
          "xlsx",
        ),
      ),
    ).toThrow("issue_sheet_import_too_many_rows");
  });

  it("rejects workbooks whose used range exceeds the decode column bound", () => {
    const headers = Array.from(
      { length: ISSUE_SHEET_IMPORT_MAX_DECODE_COLUMNS + 1 },
      (_, index) => `Col ${index + 1}`,
    );
    expect(() =>
      parseIssueSheetImportWorkbook(workbookBytes([headers, headers.map(() => "x")], "xlsx")),
    ).toThrow("issue_sheet_import_too_many_rows");
  });

  it("rejects workbooks with an inflated used range before materializing rows", async () => {
    const zip = await JSZip.loadAsync(workbookBytes([["Title"], ["One visible row"]], "xlsx"));
    const sheetPath = Object.keys(zip.files).find((path) =>
      /xl\/worksheets\/sheet\d+\.xml$/.test(path),
    );
    if (!sheetPath) {
      throw new Error("Expected an xlsx worksheet part");
    }
    const sheetXml = await zip.file(sheetPath)?.async("string");
    if (!sheetXml) {
      throw new Error("Expected worksheet XML");
    }
    const inflatedXml = sheetXml.replace(
      /<dimension[^>]*ref="A1:A2"[^>]*\/>/,
      `<dimension ref="A1:A${ISSUE_SHEET_IMPORT_MAX_ROWS + 50}"/>`,
    );
    if (inflatedXml === sheetXml) {
      throw new Error(`Expected to rewrite worksheet dimension, got ${sheetXml}`);
    }
    zip.file(sheetPath, inflatedXml);
    const inflatedBytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));

    expect(() => parseIssueSheetImportWorkbook(inflatedBytes)).toThrow(
      "issue_sheet_import_too_many_rows",
    );
  });
});
