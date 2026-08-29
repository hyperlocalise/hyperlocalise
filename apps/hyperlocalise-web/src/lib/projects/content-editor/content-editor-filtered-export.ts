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

export const contentEditorFilteredExportFormats = ["csv", "tmx", "xlf", "xliff"] as const;

export type ContentEditorFilteredExportFormat = (typeof contentEditorFilteredExportFormats)[number];

export type ContentEditorFilteredExportRow = {
  key: string;
  sourceText: string;
  targetText: string;
  sourceLocale: string;
  targetLocale: string;
  sourcePath?: string;
};

export const maxCatFilteredExportSegments = 5_000;

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function serializeCatFilteredExportCsv(rows: readonly ContentEditorFilteredExportRow[]) {
  const header = [
    "key",
    "source_locale",
    "target_locale",
    "source_text",
    "target_text",
    "source_path",
  ];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.key,
        row.sourceLocale,
        row.targetLocale,
        row.sourceText,
        row.targetText,
        row.sourcePath ?? "",
      ]
        .map(escapeCsvCell)
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function serializeCatFilteredExportTmx(rows: readonly ContentEditorFilteredExportRow[]) {
  const body = rows
    .map((row) => {
      const tuid = escapeXml(row.key);
      return [
        `  <tu tuid="${tuid}">`,
        `    <tuv xml:lang="${escapeXml(row.sourceLocale)}"><seg>${escapeXml(row.sourceText)}</seg></tuv>`,
        `    <tuv xml:lang="${escapeXml(row.targetLocale)}"><seg>${escapeXml(row.targetText)}</seg></tuv>`,
        `  </tu>`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<tmx version="1.4">`,
    `  <header creationtool="Hyperlocalise" creationtoolversion="1" segtype="sentence" o-tmf="Hyperlocalise" adminlang="en" srclang="${escapeXml(rows[0]?.sourceLocale ?? "en")}" datatype="plaintext"/>`,
    `  <body>`,
    body,
    `  </body>`,
    `</tmx>`,
    ``,
  ].join("\n");
}

export function serializeCatFilteredExportXliff(rows: readonly ContentEditorFilteredExportRow[]) {
  const sourceLocale = rows[0]?.sourceLocale ?? "en";
  const targetLocale = rows[0]?.targetLocale ?? "und";
  const original = rows[0]?.sourcePath ?? "cat-export";

  const units = rows
    .map((row, index) => {
      const id = escapeXml(row.key || `unit-${index + 1}`);
      return [
        `    <trans-unit id="${id}">`,
        `      <source xml:lang="${escapeXml(row.sourceLocale)}">${escapeXml(row.sourceText)}</source>`,
        `      <target xml:lang="${escapeXml(row.targetLocale)}">${escapeXml(row.targetText)}</target>`,
        `    </trans-unit>`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">`,
    `  <file original="${escapeXml(original)}" source-language="${escapeXml(sourceLocale)}" target-language="${escapeXml(targetLocale)}" datatype="plaintext">`,
    `    <body>`,
    units,
    `    </body>`,
    `  </file>`,
    `</xliff>`,
    ``,
  ].join("\n");
}

export function serializeCatFilteredExport(
  format: ContentEditorFilteredExportFormat,
  rows: readonly ContentEditorFilteredExportRow[],
) {
  switch (format) {
    case "csv":
      return {
        body: serializeCatFilteredExportCsv(rows),
        contentType: "text/csv; charset=utf-8",
        extension: "csv",
      };
    case "tmx":
      return {
        body: serializeCatFilteredExportTmx(rows),
        contentType: "application/x-tmx+xml; charset=utf-8",
        extension: "tmx",
      };
    case "xlf":
      return {
        body: serializeCatFilteredExportXliff(rows),
        contentType: "application/x-xliff+xml; charset=utf-8",
        extension: "xlf",
      };
    case "xliff":
      return {
        body: serializeCatFilteredExportXliff(rows),
        contentType: "application/xliff+xml; charset=utf-8",
        extension: "xliff",
      };
  }
}

export function buildCatFilteredExportFilename(input: {
  sourcePath: string;
  targetLocale: string;
  extension: string;
}) {
  const base =
    input.sourcePath === "*"
      ? "all-files"
      : (input.sourcePath
          .split("/")
          .pop()
          ?.replace(/\.[^.]+$/, "") ?? "cat-export");
  return `${base}-${input.targetLocale}.${input.extension}`;
}
