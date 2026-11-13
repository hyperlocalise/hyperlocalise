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

import { err, fromThrowable, isErr, ok, type Result } from "@/lib/primitives/result/results";

import type { XlsxWorkbookError } from "./xlsx-workbook";

// Legacy binary workbooks (.xls) are converted to .xlsx once, then keyed, translated, and
// downloaded with the .xlsx rules. The CLI does not read .xls, so this path is in-process
// only. Conversion keeps sheets, cell values, formulas, and hidden state, but not styles.

/** BIFF workbooks are not zipped, so the raw upload is bounded instead. */
const XLS_MAX_BYTES = 64 * 1024 * 1024;

/** SheetJS also reads CSV and HTML, so anything without the OLE2 signature is rejected. */
const XLS_COMPOUND_FILE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function isCompoundFile(content: Uint8Array): boolean {
  return XLS_COMPOUND_FILE_SIGNATURE.every((byte, index) => content[index] === byte);
}

export function convertXlsToXlsx(content: Uint8Array): Result<Uint8Array, XlsxWorkbookError> {
  if (content.byteLength > XLS_MAX_BYTES) {
    return err({ code: "xlsx_too_large" });
  }
  if (!isCompoundFile(content)) {
    return err({ code: "invalid_xlsx" });
  }
  const converted = fromThrowable(() => {
    const workbook = XLSX.read(content, {
      type: "array",
      cellFormula: true,
      cellHTML: false,
      cellText: false,
      cellDates: false,
      cellStyles: false,
    });
    return XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
      compression: true,
    }) as ArrayBuffer;
  })();
  if (isErr(converted)) {
    return err({ code: "invalid_xlsx" });
  }
  return ok(new Uint8Array(converted.value));
}

/**
 * The `.xlsx` bytes for a stored spreadsheet. Decided by content, not extension: `.xls`
 * sources download as `.xlsx`, so translated copies come back in either format.
 */
export function spreadsheetXlsxContent(content: Uint8Array): Result<Uint8Array, XlsxWorkbookError> {
  return isCompoundFile(content) ? convertXlsToXlsx(content) : ok(content);
}
