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
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";

/** Sentinel `sourcePath` for CAT queue requests that span every file in scope. */
export const CONTENT_EDITOR_ALL_FILES_SOURCE_PATH = "*";

export const CAT_ALL_FILES_FILENAME = "All Files";

export function isContentEditorAllFilesSourcePath(sourcePath: string | null | undefined) {
  return !sourcePath?.trim() || sourcePath.trim() === CONTENT_EDITOR_ALL_FILES_SOURCE_PATH;
}

/**
 * All Files is release-gated and currently supported for native projects
 * (`providerKind` null/undefined) and Crowdin only.
 */
export function supportsContentEditorAllFilesProvider(
  providerKind: ExternalTmsProviderKind | null | undefined,
) {
  return providerKind == null || providerKind === "crowdin";
}

export function normalizeCatSourcePathParam(sourcePath: string | null | undefined) {
  const trimmed = sourcePath?.trim() ?? "";
  if (!trimmed || trimmed === CONTENT_EDITOR_ALL_FILES_SOURCE_PATH) {
    return CONTENT_EDITOR_ALL_FILES_SOURCE_PATH;
  }
  return trimmed;
}

export function parseCatSourcePathsFilter(sourcePaths: string | null | undefined) {
  if (!sourcePaths?.trim()) {
    return null;
  }

  const seen = new Set<string>();
  const paths: string[] = [];
  for (const part of sourcePaths.split(",")) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    paths.push(trimmed);
  }

  return paths.length > 0 ? paths : null;
}

export function serializeCatSourcePathsFilter(sourcePaths: readonly (string | null | undefined)[]) {
  return sourcePaths
    .filter((path): path is string => typeof path === "string" && Boolean(path.trim()))
    .map((path) => path.trim())
    .join(",");
}
