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

export const ISSUE_SHEET_PROTECTED_COLUMN_KEYS = ["priority", "owner_note", "context"] as const;

const protectedColumnKeySet = new Set<string>(ISSUE_SHEET_PROTECTED_COLUMN_KEYS);

export function isIssueSheetProtectedColumnKey(key: string) {
  return protectedColumnKeySet.has(key);
}

export function canDeleteIssueSheetColumn(column: { key: string; layer: string }) {
  return column.layer === "custom" && !isIssueSheetProtectedColumnKey(column.key);
}
