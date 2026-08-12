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
import { DETAIL_EXCLUDED_COLUMN_KEYS, type IssueSheetColumn } from "./issue-sheet-column-types";
import type { IssueDetailIssue } from "./issue-detail-utils";

export function issueSheetColumnValueString(value: unknown) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
}

export function isDetailExcludedColumnKey(key: string) {
  return (DETAIL_EXCLUDED_COLUMN_KEYS as readonly string[]).includes(key);
}

export function listDetailPanelColumns(columns: IssueSheetColumn[]) {
  return columns
    .filter(
      (column) =>
        !column.hidden && column.layer !== "system" && !isDetailExcludedColumnKey(column.key),
    )
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
}

export function isIssueSheetColumnVisible(columns: IssueSheetColumn[], key: string) {
  const column = columns.find((entry) => entry.key === key);
  return column ? !column.hidden : true;
}

export function isMainContentCustomColumn(column: IssueSheetColumn) {
  return column.type === "long_text" || column.type === "enrichment";
}

export function isSidebarCustomColumn(column: IssueSheetColumn) {
  return !isMainContentCustomColumn(column);
}

export function isDraftableCustomColumn(column: IssueSheetColumn) {
  return column.type === "text" || column.type === "long_text" || column.type === "enrichment";
}

export function customColumnValueFromIssue(issue: IssueDetailIssue, columnKey: string) {
  return issueSheetColumnValueString(issue.values[columnKey]);
}

export function areCustomColumnDraftsDirty(
  issue: IssueDetailIssue,
  columns: IssueSheetColumn[],
  drafts: Record<string, string>,
) {
  return columns
    .filter(isDraftableCustomColumn)
    .some((column) => drafts[column.key] !== customColumnValueFromIssue(issue, column.key));
}

export function buildCustomColumnDrafts(
  issue: IssueDetailIssue,
  columns: IssueSheetColumn[],
): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const column of columns.filter(isDraftableCustomColumn)) {
    drafts[column.key] = customColumnValueFromIssue(issue, column.key);
  }
  return drafts;
}
