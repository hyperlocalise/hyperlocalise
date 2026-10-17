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
import type JSZip from "jszip";
import * as XLSX from "xlsx";

import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { xlsxLocaleColumn } from "./xlsx-columns";
import {
  isTranslatableXlsxCell,
  loadXlsxWorkbook,
  XLSX_SHEET_SEPARATOR,
  type XlsxSheet,
  type XlsxWorkbookError,
} from "./xlsx-workbook";

// Mirrors MarshalXLSX in internal/i18n/translationfileparser/xlsx_parser.go. Values are
// written as inline strings into the sheet XML of the template; every other part of the
// package (shared strings, styles, drawings, formulas) is carried over untouched.

type CellWrite = {
  row: number;
  column: number;
  text: string;
  /** Copy the `s` style of this column's cell in the same row. */
  styleFromColumn?: number;
};

type SheetPatch = {
  writes: CellWrite[];
  /** A target column appended after the last used column, and the column it copies. */
  appended?: { column: number; sourceColumn: number };
};

type ParsedCell = { column: number; attributes: string; raw: string };
type ParsedRow = {
  number: number;
  attributes: string;
  cells: ParsedCell[];
  selfClosing: boolean;
  modified: boolean;
};

const WORKBOOK_PART_FALLBACK = "xl/workbook.xml";
const ROOT_RELS_PART = "_rels/.rels";
const OFFICE_DOCUMENT_RELATIONSHIP_SUFFIX = "/officeDocument";
const ATTRIBUTE_BODY = String.raw`(?:"[^"]*"|'[^']*'|[^>"'])*?`;
const XML_ENTITY_PATTERN = /&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g;
const XML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
// oxlint-disable-next-line no-control-regex
const INVALID_XML_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
/** ST_Xstring decodes `_xHHHH_`; a literal match must escape its leading underscore. */
const XSTRING_ESCAPE_PATTERN = /_(x[0-9A-Fa-f]{4}_)/g;
const CELL_REFERENCE_PATTERN = /^([A-Z]{1,3})([1-9]\d*)$/;
const MAX_COLUMN_INDEX = 16_383;

function attributeValue(attributes: string, name: string): string | null {
  const pattern = new RegExp(String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)')`);
  const match = pattern.exec(attributes);
  return match ? decodeXmlEntities(match[1] ?? match[2] ?? "") : null;
}

function withoutAttribute(attributes: string, name: string): string {
  return attributes.replace(new RegExp(String.raw`\s+${name}\s*=\s*(?:"[^"]*"|'[^']*')`, "g"), "");
}

function decodeXmlEntities(value: string): string {
  return value.replace(XML_ENTITY_PATTERN, (match, decimal, hex, named) => {
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    return XML_NAMED_ENTITIES[named] ?? match;
  });
}

function escapeXmlText(value: string): string {
  return value
    .replace(INVALID_XML_CHAR_PATTERN, "")
    .replace(XSTRING_ESCAPE_PATTERN, "_x005F_$1")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "&#13;");
}

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function resolvePartPath(baseDirectory: string, target: string): string {
  if (target.startsWith("/")) {
    return target.slice(1);
  }
  const segments = baseDirectory ? baseDirectory.split("/") : [];
  for (const part of target.split("/")) {
    if (part === "..") segments.pop();
    else if (part && part !== ".") segments.push(part);
  }
  return segments.join("/");
}

function relationshipTargets(relsXml: string): Map<string, { target: string; type: string }> {
  const out = new Map<string, { target: string; type: string }>();
  const pattern = new RegExp(String.raw`<(?:[\w.-]+:)?Relationship\b(${ATTRIBUTE_BODY})\/?>`, "g");
  for (const match of relsXml.matchAll(pattern)) {
    const attributes = match[1] ?? "";
    const id = attributeValue(attributes, "Id");
    const target = attributeValue(attributes, "Target");
    if (id && target) {
      out.set(id, { target, type: attributeValue(attributes, "Type") ?? "" });
    }
  }
  return out;
}

/** Maps sheet names to their worksheet part paths through the workbook relationships. */
async function worksheetPartsByName(zip: JSZip): Promise<Map<string, string>> {
  let workbookPart = WORKBOOK_PART_FALLBACK;
  const rootRels = await zip.file(ROOT_RELS_PART)?.async("string");
  if (rootRels) {
    for (const relationship of relationshipTargets(rootRels).values()) {
      if (relationship.type.endsWith(OFFICE_DOCUMENT_RELATIONSHIP_SUFFIX)) {
        workbookPart = resolvePartPath("", relationship.target);
        break;
      }
    }
  }
  const slash = workbookPart.lastIndexOf("/");
  const workbookDirectory = slash === -1 ? "" : workbookPart.slice(0, slash);
  const workbookFile = slash === -1 ? workbookPart : workbookPart.slice(slash + 1);
  const relsPart = `${workbookDirectory ? `${workbookDirectory}/` : ""}_rels/${workbookFile}.rels`;

  const [workbookXml, workbookRels] = await Promise.all([
    zip.file(workbookPart)?.async("string"),
    zip.file(relsPart)?.async("string"),
  ]);
  const parts = new Map<string, string>();
  if (!workbookXml || !workbookRels) {
    return parts;
  }
  const targets = relationshipTargets(workbookRels);
  const sheetPattern = new RegExp(String.raw`<(?:[\w.-]+:)?sheet\b(${ATTRIBUTE_BODY})\/?>`, "g");
  for (const match of workbookXml.matchAll(sheetPattern)) {
    const attributes = match[1] ?? "";
    const name = attributeValue(attributes, "name");
    const relationshipId = /(?:^|\s)[\w.-]+:id\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attributes);
    const target = targets.get(relationshipId?.[1] ?? relationshipId?.[2] ?? "");
    if (name && target) {
      parts.set(name, resolvePartPath(workbookDirectory, target.target));
    }
  }
  return parts;
}

function cellWritesForCellLayout(
  sheet: XlsxSheet,
  values: Readonly<Record<string, string>>,
): CellWrite[] {
  const prefix = `${sheet.name}${XLSX_SHEET_SEPARATOR}`;
  const writes: CellWrite[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(prefix) || !value) {
      continue;
    }
    const reference = key.slice(prefix.length);
    if (reference.includes(XLSX_SHEET_SEPARATOR) || !CELL_REFERENCE_PATTERN.test(reference)) {
      continue;
    }
    const { r, c } = XLSX.utils.decode_cell(reference);
    if (isTranslatableXlsxCell(sheet, r, c)) {
      writes.push({ row: r, column: c, text: value });
    }
  }
  return writes;
}

function cellWritesForRows(
  sheet: XlsxSheet,
  values: Readonly<Record<string, string>>,
  sourceColumn: number,
  targetLocale: string,
): SheetPatch {
  let targetColumn = xlsxLocaleColumn(sheet.columns, targetLocale, [sourceColumn]);
  const writes: CellWrite[] = [];
  let appended: SheetPatch["appended"];
  if (targetColumn < 0) {
    targetColumn = sheet.columnCount;
    if (targetColumn > MAX_COLUMN_INDEX) {
      return { writes };
    }
    appended = { column: targetColumn, sourceColumn };
    writes.push({
      row: 0,
      column: targetColumn,
      text: targetLocale.trim(),
      styleFromColumn: sourceColumn,
    });
  }
  for (let row = 1; row < sheet.rowCount; row += 1) {
    const key = sheet.rowKeys.get(row);
    const value = key ? values[key] : undefined;
    if (!value || sheet.rows.get(row)?.get(targetColumn)?.hasFormula) {
      continue;
    }
    writes.push({
      row,
      column: targetColumn,
      text: value,
      ...(appended ? { styleFromColumn: sourceColumn } : {}),
    });
  }
  return { writes, appended };
}

function parseRows(inner: string, prefix: string): ParsedRow[] {
  const rowPattern = new RegExp(
    String.raw`<${prefix}row\b(${ATTRIBUTE_BODY})(?:\/>|>([\s\S]*?)<\/${prefix}row>)`,
    "g",
  );
  const cellPattern = new RegExp(
    String.raw`<${prefix}c\b(${ATTRIBUTE_BODY})(?:\/>|>([\s\S]*?)<\/${prefix}c>)`,
    "g",
  );
  const rows: ParsedRow[] = [];
  let previousRow = 0;
  for (const rowMatch of inner.matchAll(rowPattern)) {
    let attributes = rowMatch[1] ?? "";
    const declared = Number.parseInt(attributeValue(attributes, "r") ?? "", 10);
    const number = Number.isFinite(declared) && declared > 0 ? declared : previousRow + 1;
    previousRow = number;
    if (attributeValue(attributes, "r") === null) {
      attributes = ` r="${number}"${attributes}`;
    }
    const cells: ParsedCell[] = [];
    let previousColumn = -1;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(cellPattern)) {
      let cellAttributes = cellMatch[1] ?? "";
      const reference = attributeValue(cellAttributes, "r");
      const column = reference ? XLSX.utils.decode_cell(reference).c : previousColumn + 1;
      previousColumn = column;
      let raw = cellMatch[0];
      if (!reference) {
        const address = XLSX.utils.encode_cell({ r: number - 1, c: column });
        cellAttributes = ` r="${address}"${cellAttributes}`;
        raw = raw.replace(new RegExp(String.raw`^<${prefix}c\b`), `<${prefix}c r="${address}"`);
      }
      cells.push({ column, attributes: cellAttributes, raw });
    }
    rows.push({
      number,
      attributes,
      cells,
      selfClosing: rowMatch[2] === undefined,
      modified: false,
    });
  }
  return rows;
}

function inlineStringCell(prefix: string, address: string, style: string | null, text: string) {
  const styleAttribute = style && style !== "0" ? ` s="${escapeXmlAttribute(style)}"` : "";
  return `<${prefix}c r="${address}"${styleAttribute} t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${escapeXmlText(text)}</${prefix}t></${prefix}is></${prefix}c>`;
}

function applyWritesToRows(rows: ParsedRow[], writes: readonly CellWrite[], prefix: string) {
  const rowsByNumber = new Map(rows.map((row) => [row.number, row]));
  const originalStyles = new Map<string, string | null>();
  for (const row of rows) {
    for (const cell of row.cells) {
      originalStyles.set(`${row.number}:${cell.column}`, attributeValue(cell.attributes, "s"));
    }
  }

  for (const write of writes) {
    const number = write.row + 1;
    let row = rowsByNumber.get(number);
    if (!row) {
      row = { number, attributes: ` r="${number}"`, cells: [], selfClosing: false, modified: true };
      rowsByNumber.set(number, row);
      rows.push(row);
    }
    row.modified = true;
    const address = XLSX.utils.encode_cell({ r: write.row, c: write.column });
    const existingIndex = row.cells.findIndex((cell) => cell.column === write.column);
    const copiedStyle =
      write.styleFromColumn === undefined
        ? null
        : (originalStyles.get(`${number}:${write.styleFromColumn}`) ?? null);
    const ownStyle = originalStyles.get(`${number}:${write.column}`) ?? null;
    const cell: ParsedCell = {
      column: write.column,
      attributes: "",
      raw: inlineStringCell(prefix, address, copiedStyle ?? ownStyle, write.text),
    };
    if (existingIndex === -1) {
      row.cells.push(cell);
    } else {
      row.cells[existingIndex] = cell;
    }
  }

  rows.sort((left, right) => left.number - right.number);
  for (const row of rows) {
    if (row.modified) {
      row.cells.sort((left, right) => left.column - right.column);
      row.attributes = withoutAttribute(row.attributes, "spans");
      row.selfClosing = false;
    }
  }
}

function serializeRows(rows: readonly ParsedRow[], prefix: string): string {
  return rows
    .map((row) =>
      row.selfClosing && row.cells.length === 0
        ? `<${prefix}row${row.attributes}/>`
        : `<${prefix}row${row.attributes}>${row.cells.map((cell) => cell.raw).join("")}</${prefix}row>`,
    )
    .join("");
}

function expandDimension(xml: string, prefix: string, writes: readonly CellWrite[]): string {
  const pattern = new RegExp(String.raw`<${prefix}dimension\b(${ATTRIBUTE_BODY})\/>`);
  const match = pattern.exec(xml);
  if (!match) {
    return xml;
  }
  const reference = attributeValue(match[1] ?? "", "ref");
  if (!reference) {
    return xml;
  }
  const range = XLSX.utils.decode_range(reference);
  for (const write of writes) {
    range.s.r = Math.min(range.s.r, write.row);
    range.s.c = Math.min(range.s.c, write.column);
    range.e.r = Math.max(range.e.r, write.row);
    range.e.c = Math.max(range.e.c, write.column);
  }
  return xml.replace(pattern, `<${prefix}dimension ref="${XLSX.utils.encode_range(range)}"/>`);
}

function copyColumnWidth(
  xml: string,
  prefix: string,
  appended: NonNullable<SheetPatch["appended"]>,
): string {
  const colsPattern = new RegExp(String.raw`<${prefix}cols\b[^>]*>([\s\S]*?)<\/${prefix}cols>`);
  const colsMatch = colsPattern.exec(xml);
  if (!colsMatch) {
    return xml;
  }
  const colPattern = new RegExp(String.raw`<${prefix}col\b(${ATTRIBUTE_BODY})\/>`, "g");
  const definitions = [...(colsMatch[1] ?? "").matchAll(colPattern)].map((match) => {
    const attributes = match[1] ?? "";
    return {
      raw: match[0],
      min: Number.parseInt(attributeValue(attributes, "min") ?? "0", 10),
      max: Number.parseInt(attributeValue(attributes, "max") ?? "0", 10),
      width: attributeValue(attributes, "width"),
    };
  });
  const sourceNumber = appended.sourceColumn + 1;
  const targetNumber = appended.column + 1;
  const source = definitions.find((col) => col.min <= sourceNumber && sourceNumber <= col.max);
  const covered = definitions.some((col) => col.min <= targetNumber && targetNumber <= col.max);
  if (!source?.width || covered) {
    return xml;
  }
  const added = {
    raw: `<${prefix}col min="${targetNumber}" max="${targetNumber}" width="${escapeXmlAttribute(source.width)}" customWidth="1"/>`,
    min: targetNumber,
    max: targetNumber,
    width: source.width,
  };
  const sorted = [...definitions, added].toSorted((left, right) => left.min - right.min);
  const openTag = /^<[^>]*>/.exec(colsMatch[0])?.[0] ?? `<${prefix}cols>`;
  return xml.replace(
    colsPattern,
    `${openTag}${sorted.map((col) => col.raw).join("")}</${prefix}cols>`,
  );
}

export function patchWorksheetXml(xml: string, patch: SheetPatch): string {
  if (patch.writes.length === 0) {
    return xml;
  }
  const sheetData = new RegExp(
    String.raw`<((?:[\w.-]+:)?)sheetData\b(${ATTRIBUTE_BODY})(?:\/>|>([\s\S]*?)<\/\1sheetData>)`,
  ).exec(xml);
  if (!sheetData) {
    return xml;
  }
  const prefix = sheetData[1] ?? "";
  const rows = parseRows(sheetData[3] ?? "", prefix);
  applyWritesToRows(rows, patch.writes, prefix);
  const replacement = `<${prefix}sheetData${sheetData[2] ?? ""}>${serializeRows(rows, prefix)}</${prefix}sheetData>`;
  let patched =
    xml.slice(0, sheetData.index) + replacement + xml.slice(sheetData.index + sheetData[0].length);
  patched = expandDimension(patched, prefix, patch.writes);
  return patch.appended ? copyColumnWidth(patched, prefix, patch.appended) : patched;
}

/**
 * Writes `values` into a copy of `template`. Multilingual sheets receive values in the
 * `targetLocale` column, appended after the last used column when row 1 has none.
 * Cell-layout sheets receive values in place of the source text. Empty values, unknown
 * keys, and formula cells are skipped.
 */
export async function applyXlsxTranslations(input: {
  template: Uint8Array;
  values: Readonly<Record<string, string>>;
  sourceLocale: string | null | undefined;
  targetLocale: string;
}): Promise<Result<Buffer, XlsxWorkbookError>> {
  const workbook = await loadXlsxWorkbook(input.template);
  if (isErr(workbook)) {
    return workbook;
  }
  const zip = workbook.value.archive;
  const parts = await worksheetPartsByName(zip);
  const sourceLocale = input.sourceLocale?.trim() ? input.sourceLocale : input.targetLocale;

  for (const sheet of workbook.value.sheets) {
    const sourceColumn = xlsxLocaleColumn(sheet.columns, sourceLocale);
    const patch =
      sourceColumn < 0
        ? { writes: cellWritesForCellLayout(sheet, input.values) }
        : cellWritesForRows(sheet, input.values, sourceColumn, input.targetLocale);
    const partPath = parts.get(sheet.name);
    const part = partPath ? zip.file(partPath) : null;
    if (!partPath || !part || patch.writes.length === 0) {
      continue;
    }
    const xml = await fromThrowableAsync(part.async("string"));
    if (isErr(xml)) {
      return err({ code: "invalid_xlsx" });
    }
    zip.file(partPath, patchWorksheetXml(xml.value, patch));
  }

  const generated = await fromThrowableAsync(
    zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  );
  return isErr(generated) ? err({ code: "invalid_xlsx" }) : ok(generated.value);
}
