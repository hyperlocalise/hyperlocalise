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
export type IssueDetailSidebarScope = "issue-detail" | "inbox";

const STORAGE_KEYS: Record<IssueDetailSidebarScope, string> = {
  "issue-detail": "issue-detail-sidebar-open:v1",
  inbox: "inbox-issue-sidebar-open:v1",
};

function parseStoredSidebarOpen(value: string | null): boolean | null {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

export function readIssueDetailSidebarOpen(
  scope: IssueDetailSidebarScope,
  fallback: boolean,
): boolean {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const stored = parseStoredSidebarOpen(window.localStorage.getItem(STORAGE_KEYS[scope]));
    if (stored !== null) {
      return stored;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function writeIssueDetailSidebarOpen(scope: IssueDetailSidebarScope, open: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEYS[scope], String(open));
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
}
