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
  "issue-detail": "issue-detail-sidebar-open:v2",
  inbox: "inbox-issue-sidebar-open:v2",
};

type IssueDetailSidebarState = Record<string, boolean>;

function parseStoredSidebarState(value: string | null): IssueDetailSidebarState | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const state: IssueDetailSidebarState = {};
    for (const [issueId, open] of Object.entries(parsed)) {
      if (typeof open === "boolean") {
        state[issueId] = open;
      }
    }

    return state;
  } catch {
    return null;
  }
}

function readStoredSidebarState(scope: IssueDetailSidebarScope): IssueDetailSidebarState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return parseStoredSidebarState(window.localStorage.getItem(STORAGE_KEYS[scope])) ?? {};
  } catch {
    return {};
  }
}

function writeStoredSidebarState(scope: IssueDetailSidebarScope, state: IssueDetailSidebarState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEYS[scope], JSON.stringify(state));
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
}

export function readIssueDetailSidebarOpen(
  scope: IssueDetailSidebarScope,
  issueId: string,
  fallback: boolean,
): boolean {
  const stored = readStoredSidebarState(scope)[issueId];
  return stored ?? fallback;
}

export function writeIssueDetailSidebarOpen(
  scope: IssueDetailSidebarScope,
  issueId: string,
  open: boolean,
) {
  const state = readStoredSidebarState(scope);
  state[issueId] = open;
  writeStoredSidebarState(scope, state);
}
