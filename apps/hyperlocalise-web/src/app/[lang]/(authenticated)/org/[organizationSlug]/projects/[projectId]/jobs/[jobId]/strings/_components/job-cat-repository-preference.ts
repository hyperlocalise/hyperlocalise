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
