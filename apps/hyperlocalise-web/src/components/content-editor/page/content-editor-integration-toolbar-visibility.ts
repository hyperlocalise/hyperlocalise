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

/** Ingest and Push toolbar buttons share this visibility gate. */
export function contentEditorToolbarShowsIntegration(
  candidates: readonly unknown[] | undefined,
): boolean {
  return (candidates?.length ?? 0) > 0;
}

export function selectActionablePushCandidates<T extends { pushRunInProgress: boolean }>(
  candidates: readonly T[],
): T[] {
  return candidates.filter((candidate) => !candidate.pushRunInProgress);
}

export function nextPushDialogSelection(
  current: readonly string[],
  availableSourcePaths: readonly string[],
): string[] {
  const available = new Set(availableSourcePaths);
  return current.filter((path) => available.has(path));
}

export function selectedPushRowsHaveEligibleLocales<
  T extends { sourcePath: string; eligibleLocaleCount: number },
>(items: readonly T[], selectedSourcePaths: readonly string[]): boolean {
  if (selectedSourcePaths.length === 0) {
    return false;
  }
  const byPath = new Map(items.map((item) => [item.sourcePath, item]));
  return selectedSourcePaths.some((path) => (byPath.get(path)?.eligibleLocaleCount ?? 0) > 0);
}
