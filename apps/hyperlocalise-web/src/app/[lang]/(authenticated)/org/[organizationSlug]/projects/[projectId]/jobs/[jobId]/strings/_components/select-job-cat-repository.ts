/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export function selectJobCatRepository({
  enabledRepositoryFullNames,
  savedRepositoryFullName,
}: {
  enabledRepositoryFullNames: readonly string[];
  savedRepositoryFullName: string | null;
}) {
  if (savedRepositoryFullName && enabledRepositoryFullNames.includes(savedRepositoryFullName)) {
    return savedRepositoryFullName;
  }

  if (enabledRepositoryFullNames.length === 1) {
    return enabledRepositoryFullNames[0] ?? null;
  }

  return null;
}

export function canLookupFreshCatRepositoryContext(
  enabledRepositoryFullNames: readonly string[],
  selectedRepositoryFullName: string | null,
) {
  return (
    enabledRepositoryFullNames.length > 0 &&
    (enabledRepositoryFullNames.length === 1 || selectedRepositoryFullName != null)
  );
}

export function sortJobCatProviderFiles<T extends { sourcePath: string }>(files: readonly T[]) {
  return [...files].toSorted((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath, undefined, { sensitivity: "base" }),
  );
}
