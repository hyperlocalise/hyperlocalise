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
  const withForwardSlashes = path.replace(/\\/g, "/").trim();
  const stripped = withForwardSlashes.replace(/^\.\//, "");
  // "./" strips to empty; keep it as the workspace root, same as ".".
  const normalized = stripped === "" && withForwardSlashes === "./" ? "." : stripped;
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    return null;
  }
  if (normalized.split("/").some((segment) => segment.startsWith("-"))) {
    return null;
  }
  return normalized;
}

/**
 * True when any path segment is `.git`.
 * `.gitignore` / `.gitattributes` stay allowed; `.git/config` does not.
 */
export function isGitMetadataPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  return normalized.split("/").includes(".git");
}

export const GIT_METADATA_WRITE_ERROR = "Writes under .git/ are not allowed.";

/** Prefix paths so shell tools like `find` treat them as relative paths, not flags. */
export function toShellRelativePath(normalizedPath: string): string {
  if (normalizedPath === ".") {
    return ".";
  }
  return normalizedPath.startsWith("-") ? `./${normalizedPath}` : normalizedPath;
}
