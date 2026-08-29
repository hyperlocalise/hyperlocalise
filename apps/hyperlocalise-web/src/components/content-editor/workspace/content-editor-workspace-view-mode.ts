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
import {
  readBrowserLocalStorageItem,
  writeBrowserLocalStorageItem,
} from "@/lib/primitives/browser-local-storage/browser-local-storage";

export type ContentEditorWorkspaceViewMode = "comfortable" | "side-by-side" | "file";

export const CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY = "content-editor-workspace-view-mode:v1";

export const CAT_COMFORTABLE_PAGE_LIMIT = 50;
export const CAT_SIDE_BY_SIDE_PAGE_LIMIT = 20;
/** File view is presentation-only; keep Comfortable queue page size so aggregate
 * selections (e.g. All Files) are not dropped when the query refetches. */
export const CAT_FILE_VIEW_PAGE_LIMIT = CAT_COMFORTABLE_PAGE_LIMIT;

export function isCatWorkspaceViewMode(
  value: string | null | undefined,
): value is ContentEditorWorkspaceViewMode {
  return value === "comfortable" || value === "side-by-side" || value === "file";
}

export function readCatWorkspaceViewMode(): ContentEditorWorkspaceViewMode {
  const stored = readBrowserLocalStorageItem(CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY);
  if (isCatWorkspaceViewMode(stored)) {
    return stored;
  }

  return "comfortable";
}

export function writeCatWorkspaceViewMode(mode: ContentEditorWorkspaceViewMode) {
  writeBrowserLocalStorageItem(CAT_WORKSPACE_VIEW_MODE_STORAGE_KEY, mode);
}

export function contentEditorPageLimitForViewMode(mode: ContentEditorWorkspaceViewMode) {
  if (mode === "side-by-side") {
    return CAT_SIDE_BY_SIDE_PAGE_LIMIT;
  }
  // File view renders one selected unit but must not shrink the queue query.
  if (mode === "file") {
    return CAT_FILE_VIEW_PAGE_LIMIT;
  }
  return CAT_COMFORTABLE_PAGE_LIMIT;
}
