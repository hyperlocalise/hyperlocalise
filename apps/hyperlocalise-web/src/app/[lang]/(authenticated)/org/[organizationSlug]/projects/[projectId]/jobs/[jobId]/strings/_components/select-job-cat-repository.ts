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
