export type LiveFileSourcePathRecord = {
  sourcePath: string;
  provider?: {
    resourceType?: "file" | "key";
    revision?: string | null;
    externalResourceId?: string;
  } | null;
};

function preferLiveFileBySourcePath<T extends LiveFileSourcePathRecord>(
  current: T,
  candidate: T,
): T {
  const currentIsFile = current.provider?.resourceType === "file";
  const candidateIsFile = candidate.provider?.resourceType === "file";
  if (currentIsFile !== candidateIsFile) {
    return candidateIsFile ? candidate : current;
  }

  const currentRevision = current.provider?.revision ?? "";
  const candidateRevision = candidate.provider?.revision ?? "";
  if (candidateRevision > currentRevision) {
    return candidate;
  }
  if (candidateRevision < currentRevision) {
    return current;
  }

  const currentId = current.provider?.externalResourceId ?? "";
  const candidateId = candidate.provider?.externalResourceId ?? "";
  return candidateId.localeCompare(currentId) > 0 ? candidate : current;
}

export function dedupeLiveFilesBySourcePath<T extends LiveFileSourcePathRecord>(files: T[]): T[] {
  const bySourcePath = new Map<string, T>();
  for (const file of files) {
    const existing = bySourcePath.get(file.sourcePath);
    bySourcePath.set(file.sourcePath, existing ? preferLiveFileBySourcePath(existing, file) : file);
  }
  return [...bySourcePath.values()];
}
