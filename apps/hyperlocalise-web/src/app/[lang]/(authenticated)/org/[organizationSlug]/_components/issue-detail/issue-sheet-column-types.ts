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
export type IssueSheetColumn = {
  id: string;
  key: string;
  label: string;
  layer: string;
  type: string;
  config: { options?: { id: string; label: string; color?: string }[] };
  sortOrder: number;
  hidden: boolean;
  icon: string | null;
};

export const DETAIL_EXCLUDED_COLUMN_KEYS = ["priority", "owner_note"] as const;

export const ISSUE_SHEET_SYSTEM_FIELD_DEFINITIONS = [
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "issue_type", label: "Type" },
  { key: "target_locale", label: "Locale" },
  { key: "assignee", label: "Assignee" },
  { key: "description", label: "Description" },
] as const;
