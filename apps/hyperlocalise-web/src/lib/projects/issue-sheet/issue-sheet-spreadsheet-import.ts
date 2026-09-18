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

import { serializeCsvRows } from "@/lib/csv/serialize-csv-rows";

import {
  ISSUE_SHEET_IMPORT_MAX_CONTENT_BYTES,
  parseIssueSheetImportTable,
} from "./issue-sheet-csv-import";

function cellToString(value: unknown) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return String(value).trim();
}

function isSheetHidden(workbook: XLSX.WorkBook, name: string) {
  const meta = workbook.Workbook?.Sheets?.find((sheet) => sheet.name === name);
  return meta?.Hidden === 1 || meta?.Hidden === 2;
}

function sheetToRows(sheet: XLSX.WorkSheet) {
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return table.map((row) => (Array.isArray(row) ? row.map(cellToString) : []));
}

function firstUsableSheetRows(workbook: XLSX.WorkBook) {
  for (const name of workbook.SheetNames) {
    if (isSheetHidden(workbook, name)) {
      continue;
    }
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      continue;
    }
    const rows = sheetToRows(sheet);
    if (rows.some((row) => row.some((cell) => cell.length > 0))) {
      return rows;
    }
  }
  return [];
}

export function serializeIssueSheetImportCsv(headers: string[], rows: string[][]) {
  return serializeCsvRows([headers, ...rows]);
}

function looksLikeSpreadsheet(content: Uint8Array) {
  if (content.byteLength < 4) {
    return false;
  }
  if (content[0] === 0x50 && content[1] === 0x4b) {
    return true;
  }
  return content[0] === 0xd0 && content[1] === 0xcf && content[2] === 0x11 && content[3] === 0xe0;
}

export function parseIssueSheetImportWorkbook(content: Uint8Array) {
  if (content.byteLength > ISSUE_SHEET_IMPORT_MAX_CONTENT_BYTES) {
    throw new Error("issue_sheet_import_file_too_large");
  }
  if (!looksLikeSpreadsheet(content)) {
    throw new Error("issue_sheet_import_invalid_spreadsheet");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(content, {
      type: "array",
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
    });
  } catch {
    throw new Error("issue_sheet_import_invalid_spreadsheet");
  }

  return parseIssueSheetImportTable(firstUsableSheetRows(workbook));
}
