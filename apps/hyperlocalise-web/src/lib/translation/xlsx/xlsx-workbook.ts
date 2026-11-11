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

import {
  err,
  fromThrowable,
  fromThrowableAsync,
  isErr,
  ok,
  type Result,
} from "@/lib/primitives/result/results";

import {
  resolveXlsxHeaderColumns,
  sameXlsxLocale,
  xlsxLocaleColumn,
  type XlsxHeaderColumns,
} from "./xlsx-columns";

// Mirrors internal/i18n/translationfileparser/xlsx_parser.go. Each visible sheet is read in
// one of two layouts chosen from its first row and the source locale:
//   - multilingual: row 1 has a source-locale column; each later row is one entry keyed by
//     its key column, or `Sheet!N:N` when the key is empty or repeats an earlier key.
//   - cell: no source-locale column; every text cell is one entry keyed `Sheet!B3`.
// Formulas, numbers, dates, booleans, and text without letters are never entries.

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const XLSX_SHEET_SEPARATOR = "!";

/** Bounds the decompressed workbook; SheetJS has no limit of its own. */
const XLSX_MAX_UNZIPPED_BYTES = 256 * 1024 * 1024;
const LETTER_PATTERN = /\p{L}/u;
const HIDDEN_SHEET_STATE_NONE = 0;

export type XlsxWorkbookError = { code: "invalid_xlsx" } | { code: "xlsx_too_large" };

export type XlsxEntry = {
  key: string;
  text: string;
  sheet: string;
  cell: string;
  comment: string;
  maxLength: number;
};

export type XlsxCell = {
  /** Raw value as text: shared or inline strings as written, numbers in JS notation. */
  value: string;
  isText: boolean;
  hasFormula: boolean;
};

export type XlsxSheet = {
  name: string;
  /** Cells by zero-based row, then zero-based column. */
  rows: ReadonlyMap<number, ReadonlyMap<number, XlsxCell>>;
  /** One past the last row with a value. */
  rowCount: number;
  /** One past the last column with a value, across all rows. */
  columnCount: number;
  columns: XlsxHeaderColumns;
  /** Multilingual row keys by zero-based row, from row 2 on. */
  rowKeys: ReadonlyMap<number, string>;
};

export type XlsxWorkbook = {
  sheets: readonly XlsxSheet[];
  /** The opened package, for writers that patch parts in place. */
  archive: JSZip;
};

/** 0-based column scheme for multilingual sheets, including headerless ones. */
export type XlsxImportOptions = {
  firstLineContainsHeader?: boolean | null;
  columns?: {
    identifier?: number | null;
    source?: number | null;
    context?: number | null;
    maxLength?: number | null;
  };
};

function xlsxSchemeActive(options?: XlsxImportOptions): boolean {
  const columns = options?.columns;
  return (
    columns?.identifier != null ||
    columns?.source != null ||
    columns?.context != null ||
    columns?.maxLength != null
  );
}

function xlsxFirstDataRow(options?: XlsxImportOptions): number {
  if (options?.firstLineContainsHeader === false) {
    return 0;
  }
  if (options?.firstLineContainsHeader === true || xlsxSchemeActive(options)) {
    return 1;
  }
  return 1;
}

function zipEntryUncompressedSize(file: JSZip.JSZipObject): number {
  const data = (file as { _data?: { uncompressedSize?: number } })._data;
  return typeof data?.uncompressedSize === "number" && data.uncompressedSize >= 0
    ? data.uncompressedSize
    : 0;
}

/** Checks declared sizes in the zip directory before SheetJS inflates every part. */
export async function checkXlsxArchiveSize(
  content: Uint8Array,
): Promise<Result<JSZip, XlsxWorkbookError>> {
  const zip = await fromThrowableAsync(JSZip.loadAsync(content));
  if (isErr(zip)) {
    return err({ code: "invalid_xlsx" });
  }
  let total = 0;
  for (const file of Object.values(zip.value.files)) {
    total += zipEntryUncompressedSize(file);
    if (total > XLSX_MAX_UNZIPPED_BYTES) {
      return err({ code: "xlsx_too_large" });
    }
  }
  return ok(zip.value);
}

function rawCellValue(cell: XLSX.CellObject): string {
  switch (cell.t) {
    case "s":
      return typeof cell.v === "string" ? cell.v : "";
    case "n":
      return typeof cell.v === "number" ? String(cell.v) : "";
    case "b":
      return cell.v ? "1" : "0";
    case "d":
      return cell.v instanceof Date ? cell.v.toISOString() : String(cell.v ?? "");
    case "e":
      return typeof cell.w === "string" ? cell.w : "";
    default:
      return "";
  }
}

function readSheetCells(sheet: XLSX.WorkSheet) {
  const rows = new Map<number, Map<number, XlsxCell>>();
  let rowCount = 0;
  let columnCount = 0;
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) {
      continue;
    }
    const cell = sheet[address] as XLSX.CellObject;
    const value = rawCellValue(cell);
    const hasFormula = typeof cell.f === "string" && cell.f.length > 0;
    if (!value && !hasFormula) {
      continue;
    }
    const { r, c } = XLSX.utils.decode_cell(address);
    let row = rows.get(r);
    if (!row) {
      row = new Map();
      rows.set(r, row);
    }
    row.set(c, { value, isText: cell.t === "s", hasFormula });
    if (value) {
      rowCount = Math.max(rowCount, r + 1);
      columnCount = Math.max(columnCount, c + 1);
    }
  }
  return { rows, rowCount, columnCount };
}

function headerRow(rows: ReadonlyMap<number, ReadonlyMap<number, XlsxCell>>): string[] {
  const first = rows.get(0);
  if (!first) {
    return [];
  }
  const width = Math.max(-1, ...first.keys()) + 1;
  return Array.from({ length: width }, (_, column) => first.get(column)?.value ?? "");
}

export function xlsxCellValue(sheet: XlsxSheet, row: number, column: number): string {
  if (column < 0) {
    return "";
  }
  return sheet.rows.get(row)?.get(column)?.value ?? "";
}

export function xlsxCellAddress(row: number, column: number): string {
  return XLSX.utils.encode_cell({ r: row, c: column });
}

export function xlsxRowKey(sheetName: string, row: number): string {
  const rowNumber = String(row + 1);
  return `${sheetName}${XLSX_SHEET_SEPARATOR}${rowNumber}:${rowNumber}`;
}

/** The row-address key, suffixed with #2, #3, ... when an earlier row already uses it. */
function uniqueXlsxRowKey(seenKeys: ReadonlySet<string>, sheetName: string, row: number): string {
  const base = xlsxRowKey(sheetName, row);
  let key = base;
  for (let suffix = 2; seenKeys.has(key); suffix += 1) {
    key = `${base}#${suffix}`;
  }
  return key;
}

export function isTranslatableXlsxCell(sheet: XlsxSheet, row: number, column: number): boolean {
  const cell = sheet.rows.get(row)?.get(column);
  return Boolean(cell && cell.isText && !cell.hasFormula && LETTER_PATTERN.test(cell.value));
}

/** Parses a workbook into its visible sheets. Hidden and very hidden sheets are skipped. */
export async function loadXlsxWorkbook(
  content: Uint8Array,
): Promise<Result<XlsxWorkbook, XlsxWorkbookError>> {
  const archive = await checkXlsxArchiveSize(content);
  if (isErr(archive)) {
    return archive;
  }
  const parsed = fromThrowable(() =>
    XLSX.read(content, {
      type: "array",
      cellFormula: true,
      cellHTML: false,
      cellText: false,
      cellDates: false,
      cellStyles: false,
    }),
  )();
  if (isErr(parsed)) {
    return err({ code: "invalid_xlsx" });
  }
  const workbook = parsed.value;

  const seenKeys = new Set<string>();
  const sheets: XlsxSheet[] = [];
  workbook.SheetNames.forEach((name, index) => {
    const hidden = workbook.Workbook?.Sheets?.[index]?.Hidden ?? HIDDEN_SHEET_STATE_NONE;
    const worksheet = workbook.Sheets[name];
    if (hidden !== HIDDEN_SHEET_STATE_NONE || !worksheet) {
      return;
    }
    const { rows, rowCount, columnCount } = readSheetCells(worksheet);
    const columns = resolveXlsxHeaderColumns(headerRow(rows));
    const rowKeys = new Map<number, string>();
    for (let row = 1; row < rowCount; row += 1) {
      let key = (columns.key >= 0 ? (rows.get(row)?.get(columns.key)?.value ?? "") : "").trim();
      if (!key || seenKeys.has(key)) {
        key = uniqueXlsxRowKey(seenKeys, name, row);
      }
      seenKeys.add(key);
      rowKeys.set(row, key);
    }
    sheets.push({ name, rows, rowCount, columnCount, columns, rowKeys });
  });
  return ok({ sheets, archive: archive.value });
}

function parseMaxLength(raw: string): number {
  const value = Number.parseFloat(raw.trim());
  if (!Number.isFinite(value) || value < 1 || value > 2 ** 31 - 1) {
    return 0;
  }
  return Math.trunc(value);
}

/**
 * Lists `locale` entries in sheet, row, and column order, with layouts chosen by
 * `sourceLocale`. Multilingual sheets read the locale column with source-derived keys;
 * a sheet without that column contributes nothing.
 */
export function readXlsxEntries(
  workbook: XlsxWorkbook,
  sourceLocale: string | null | undefined,
  locale: string,
  options?: XlsxImportOptions,
): XlsxEntry[] {
  const source = sourceLocale?.trim() ? sourceLocale : locale;
  const entries: XlsxEntry[] = [];
  const seenKeys = new Set<string>();
  for (const sheet of workbook.sheets) {
    let sourceColumn = xlsxLocaleColumn(sheet.columns, source);
    let keyColumn = sheet.columns.key;
    let commentColumn = sheet.columns.comment;
    let maxLengthColumn = sheet.columns.maxLength;
    const scheme = xlsxSchemeActive(options);
    if (options?.columns?.source != null) {
      sourceColumn = options.columns.source;
    }
    if (options?.columns?.identifier != null) {
      keyColumn = options.columns.identifier;
    }
    if (options?.columns?.context != null) {
      commentColumn = options.columns.context;
    }
    if (options?.columns?.maxLength != null) {
      maxLengthColumn = options.columns.maxLength;
    }
    if (sourceColumn < 0) {
      entries.push(...cellLayoutEntries(sheet));
      continue;
    }
    const column =
      !scheme && !sameXlsxLocale(locale, source)
        ? xlsxLocaleColumn(sheet.columns, locale, [sourceColumn])
        : sourceColumn;
    if (column < 0) {
      continue;
    }
    const firstRow =
      scheme || options?.firstLineContainsHeader === false ? xlsxFirstDataRow(options) : 1;
    for (let row = firstRow; row < sheet.rowCount; row += 1) {
      if (!isTranslatableXlsxCell(sheet, row, column)) {
        continue;
      }
      let key = scheme ? "" : (sheet.rowKeys.get(row) ?? "");
      if (!key) {
        key = xlsxCellValue(sheet, row, keyColumn).trim();
        if (!key || seenKeys.has(key)) {
          key = uniqueXlsxRowKey(seenKeys, sheet.name, row);
        }
        seenKeys.add(key);
      }
      entries.push({
        key,
        text: xlsxCellValue(sheet, row, column),
        sheet: sheet.name,
        cell: xlsxCellAddress(row, column),
        comment: xlsxCellValue(sheet, row, commentColumn).trim(),
        maxLength: parseMaxLength(xlsxCellValue(sheet, row, maxLengthColumn)),
      });
    }
  }
  return entries;
}

function cellLayoutEntries(sheet: XlsxSheet): XlsxEntry[] {
  const entries: XlsxEntry[] = [];
  const rowIndexes = [...sheet.rows.keys()].toSorted((left, right) => left - right);
  for (const row of rowIndexes) {
    const columns = [...(sheet.rows.get(row)?.keys() ?? [])].toSorted(
      (left, right) => left - right,
    );
    for (const column of columns) {
      if (!isTranslatableXlsxCell(sheet, row, column)) {
        continue;
      }
      const cell = xlsxCellAddress(row, column);
      entries.push({
        key: `${sheet.name}${XLSX_SHEET_SEPARATOR}${cell}`,
        text: xlsxCellValue(sheet, row, column),
        sheet: sheet.name,
        cell,
        comment: "",
        maxLength: 0,
      });
    }
  }
  return entries;
}
