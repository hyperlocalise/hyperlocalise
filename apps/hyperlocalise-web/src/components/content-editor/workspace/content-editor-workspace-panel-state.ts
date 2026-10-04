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

export const CAT_FILES_PANEL_COLLAPSED_STORAGE_KEY = "content-editor-files-panel-collapsed:v1";
export const CAT_DETAILS_PANEL_COLLAPSED_STORAGE_KEY = "content-editor-details-panel-collapsed:v1";
export const CAT_SHORTCUT_HINTS_HIDDEN_STORAGE_KEY = "content-editor-shortcut-hints-hidden:v1";

function readCollapsed(key: string) {
  return readBrowserLocalStorageItem(key) === "true";
}

function writeCollapsed(key: string, collapsed: boolean) {
  writeBrowserLocalStorageItem(key, collapsed ? "true" : "false");
}

export function readCatFilesPanelCollapsed() {
  return readCollapsed(CAT_FILES_PANEL_COLLAPSED_STORAGE_KEY);
}

export function writeCatFilesPanelCollapsed(collapsed: boolean) {
  writeCollapsed(CAT_FILES_PANEL_COLLAPSED_STORAGE_KEY, collapsed);
}

export function readCatDetailsPanelCollapsed() {
  return readCollapsed(CAT_DETAILS_PANEL_COLLAPSED_STORAGE_KEY);
}

export function writeCatDetailsPanelCollapsed(collapsed: boolean) {
  writeCollapsed(CAT_DETAILS_PANEL_COLLAPSED_STORAGE_KEY, collapsed);
}

export function readCatShortcutHintsHidden() {
  return readCollapsed(CAT_SHORTCUT_HINTS_HIDDEN_STORAGE_KEY);
}

export function writeCatShortcutHintsHidden(hidden: boolean) {
  writeCollapsed(CAT_SHORTCUT_HINTS_HIDDEN_STORAGE_KEY, hidden);
}
