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

const STORAGE_PREFIX = "job-content-editor-repository";

export function contentEditorFileRepositoryPreferenceKey(
  organizationSlug: string,
  projectId: string,
  sourcePath: string,
) {
  return `${STORAGE_PREFIX}:${organizationSlug}:${projectId}:${sourcePath}`;
}

export function readCatFileRepositoryPreference(storageKey: string): string | null {
  const value = readBrowserLocalStorageItem(storageKey)?.trim();
  return value ? value : null;
}

export function writeCatFileRepositoryPreference(storageKey: string, repositoryFullName: string) {
  writeBrowserLocalStorageItem(storageKey, repositoryFullName);
}
