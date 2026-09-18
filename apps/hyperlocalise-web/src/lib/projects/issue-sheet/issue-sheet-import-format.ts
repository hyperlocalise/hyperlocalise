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
export type IssueSheetImportFormat = "csv" | "xls" | "xlsx";

export const ISSUE_SHEET_IMPORT_ACCEPT: Record<IssueSheetImportFormat, string> = {
  csv: ".csv,text/csv",
  xls: ".xls,application/vnd.ms-excel",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const ISSUE_SHEET_IMPORT_ACCEPT_ALL = [
  ISSUE_SHEET_IMPORT_ACCEPT.csv,
  ISSUE_SHEET_IMPORT_ACCEPT.xls,
  ISSUE_SHEET_IMPORT_ACCEPT.xlsx,
].join(",");

export function issueSheetImportFormatFromFilename(filename: string): IssueSheetImportFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    return "csv";
  }
  if (lower.endsWith(".xlsx")) {
    return "xlsx";
  }
  if (lower.endsWith(".xls")) {
    return "xls";
  }
  return null;
}
