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

export const contentEditorFilteredExportFormats = ["csv", "tmx", "xlf", "xliff", "xlsx"] as const;

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

export const catBilingualImportAccept = ".csv,.tmx,.xlf,.xliff,.xlsx";

const bilingualFormatByExtension: Record<string, ContentEditorFilteredExportFormat> = {
  csv: "csv",
  tmx: "tmx",
  xlf: "xlf",
  xliff: "xliff",
  xlsx: "xlsx",
};

export function inferCatBilingualFormat(
  filename: string,
): ContentEditorFilteredExportFormat | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) {
    return null;
  }
  const ext = filename.slice(dot + 1).toLowerCase();
  return bilingualFormatByExtension[ext] ?? null;
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
