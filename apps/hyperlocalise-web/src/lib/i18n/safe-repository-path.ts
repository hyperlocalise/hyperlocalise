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
export function normalizeRepositoryRelativePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

export function isSafeRepositoryRelativePath(path: string): boolean {
  const trimmed = path.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return false;
  }

  const normalized = normalizeRepositoryRelativePath(path);
  if (!normalized || normalized === ".") {
    return false;
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    return false;
  }

  if (normalized === ".git" || normalized.startsWith(".git/") || segments.includes(".git")) {
    return false;
  }

  return true;
}
