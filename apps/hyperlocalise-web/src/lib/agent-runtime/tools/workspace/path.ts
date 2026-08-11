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
/**
 * Normalize a workspace-relative path. Returns null when the path escapes the repo root.
 */
export function normalizeWorkspacePath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    return null;
  }
  if (normalized.split("/").some((segment) => segment.startsWith("-"))) {
    return null;
  }
  return normalized;
}

/** Prefix paths so shell tools like `find` treat them as relative paths, not flags. */
export function toShellRelativePath(normalizedPath: string): string {
  if (normalizedPath === ".") {
    return ".";
  }
  return normalizedPath.startsWith("-") ? `./${normalizedPath}` : normalizedPath;
}
