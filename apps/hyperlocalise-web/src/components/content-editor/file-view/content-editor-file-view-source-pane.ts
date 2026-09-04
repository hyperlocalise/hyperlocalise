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

export const CAT_FILE_VIEW_SOURCE_PANE_STORAGE_KEY = "content-editor-file-view:source-pane:v1";

export function readCatFileViewSourcePaneVisible() {
  const stored = readBrowserLocalStorageItem(CAT_FILE_VIEW_SOURCE_PANE_STORAGE_KEY);
  if (stored === "false") {
    return false;
  }
  return true;
}

export function writeCatFileViewSourcePaneVisible(visible: boolean) {
  writeBrowserLocalStorageItem(CAT_FILE_VIEW_SOURCE_PANE_STORAGE_KEY, String(visible));
}
