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
const STORAGE_PREFIX = "job-cat-repository";

export function catFileRepositoryPreferenceKey(
  organizationSlug: string,
  projectId: string,
  sourcePath: string,
) {
  return `${STORAGE_PREFIX}:${organizationSlug}:${projectId}:${sourcePath}`;
}

export function readCatFileRepositoryPreference(storageKey: string): string | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }

    const value = localStorage.getItem(storageKey);
    return value?.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writeCatFileRepositoryPreference(storageKey: string, repositoryFullName: string) {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }

    localStorage.setItem(storageKey, repositoryFullName);
  } catch {
    // Storage may be unavailable in private browsing or when quota is exceeded.
  }
}
