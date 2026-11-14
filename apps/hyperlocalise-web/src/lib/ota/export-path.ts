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

/** Default public export path is the source file's basename with a leading slash. */
export function exportPathFromSourcePath(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  const basename = segments.at(-1) ?? "messages.json";
  return `/${basename}`;
}

export function findExportPathCollisions(sourcePaths: readonly string[]): string[] {
  const seen = new Map<string, number>();
  for (const sourcePath of sourcePaths) {
    const exportPath = exportPathFromSourcePath(sourcePath);
    seen.set(exportPath, (seen.get(exportPath) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([path]) => path);
}
