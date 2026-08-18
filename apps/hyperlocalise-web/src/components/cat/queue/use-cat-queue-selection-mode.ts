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

const STORAGE_KEY = "cat-queue:selection-mode:v1";

export function readCatQueueSelectionModePreference() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeCatQueueSelectionModePreference(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore storage failures in private browsing or restricted contexts.
  }
}
