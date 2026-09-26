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

export type IssueSourceFileOption = {
  sourcePath: string;
  filename: string;
};

export function filenameFromSourcePath(sourcePath: string) {
  const normalized = sourcePath.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? sourcePath;
}

export function buildIssueSourcePathOptions(
  files: Array<{ sourcePath: string; filename?: string | null }>,
  currentSourcePath?: string | null,
): IssueSourceFileOption[] {
  const byPath = new Map<string, IssueSourceFileOption>();

  for (const file of files) {
    const sourcePath = file.sourcePath.trim();
    if (!sourcePath) {
      continue;
    }
    byPath.set(sourcePath, {
      sourcePath,
      filename: file.filename?.trim() || filenameFromSourcePath(sourcePath),
    });
  }

  const current = currentSourcePath?.trim();
  if (current && !byPath.has(current)) {
    byPath.set(current, {
      sourcePath: current,
      filename: filenameFromSourcePath(current),
    });
  }

  return [...byPath.values()].toSorted((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath, undefined, { sensitivity: "base" }),
  );
}
