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

import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";
import { isErr } from "@/lib/primitives/result/results";
import { loadXlsxWorkbook, readXlsxEntries } from "@/lib/translation/xlsx/xlsx-workbook";

import type { HlEntriesPayload } from "./hl-entries";
import type { ExcelImportSettings } from "./source-file-import-settings-schema";

function bytesFromStoredFileContent(content: unknown): Uint8Array | null {
  if (content instanceof Uint8Array) {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }
  if (ArrayBuffer.isView(content)) {
    const view = content as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (
    content &&
    typeof content === "object" &&
    "data" in content &&
    Array.isArray((content as { data: unknown }).data)
  ) {
    return Uint8Array.from((content as { data: number[] }).data);
  }
  return null;
}

export function isExcelTranslationSourcePath(sourcePath: string): boolean {
  const format = inferSupportedTranslationFileFormat(sourcePath);
  return format === "xlsx" || format === "xls";
}

export async function applyXlsxIngestEntries(
  sourcePath: string,
  sourceContent: unknown,
  payload: HlEntriesPayload,
  settings: ExcelImportSettings,
): Promise<HlEntriesPayload> {
  if (!isExcelTranslationSourcePath(sourcePath)) {
    return payload;
  }
  const bytes = bytesFromStoredFileContent(sourceContent);
  if (!bytes) {
    return payload;
  }
  const workbook = await loadXlsxWorkbook(bytes);
  if (isErr(workbook)) {
    return payload;
  }
  const entries = readXlsxEntries(workbook.value, null, "", settings);
  const out: HlEntriesPayload = {};
  for (const entry of entries) {
    out[entry.key] = {
      text: entry.text,
      ...(entry.comment ? { context: entry.comment } : {}),
      ...(entry.maxLength > 0 ? { maxLength: entry.maxLength } : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : payload;
}
