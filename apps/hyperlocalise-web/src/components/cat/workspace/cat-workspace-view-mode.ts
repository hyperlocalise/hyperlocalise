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
export type CatWorkspaceViewMode = "comfortable" | "side-by-side" | "file";

export const CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY = "cat-workspace-view-mode:v1";

export const CAT_COMFORTABLE_PAGE_LIMIT = 50;
export const CAT_SIDE_BY_SIDE_PAGE_LIMIT = 20;
export const CAT_FILE_VIEW_PAGE_LIMIT = 1;

export function isCatWorkspaceViewMode(value: string | null | undefined): value is CatWorkspaceViewMode {
  return value === "comfortable" || value === "side-by-side" || value === "file";
}

export function readCatWorkspaceViewMode(): CatWorkspaceViewMode {
  if (typeof window === "undefined") {
    return "comfortable";
  }

  try {
    const stored = window.localStorage.getItem(CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY);
    if (isCatWorkspaceViewMode(stored)) {
      return stored;
    }
  } catch {
    return "comfortable";
  }

  return "comfortable";
}

export function writeCatWorkspaceViewMode(mode: CatWorkspaceViewMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
}

export function catPageLimitForViewMode(mode: CatWorkspaceViewMode) {
  if (mode === "side-by-side") {
    return CAT_SIDE_BY_SIDE_PAGE_LIMIT;
  }
  if (mode === "file") {
    return CAT_FILE_VIEW_PAGE_LIMIT;
  }
  return CAT_COMFORTABLE_PAGE_LIMIT;
}
