import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";

/** Sentinel `sourcePath` for CAT queue requests that span every file in scope. */
export const CAT_ALL_FILES_SOURCE_PATH = "*";

export const CAT_ALL_FILES_FILENAME = "All Files";

export function isCatAllFilesSourcePath(sourcePath: string | null | undefined) {
  return !sourcePath?.trim() || sourcePath.trim() === CAT_ALL_FILES_SOURCE_PATH;
}

/**
 * All Files is release-gated and currently supported for native projects
 * (`providerKind` null/undefined) and Crowdin only.
 */
export function supportsCatAllFilesProvider(
  providerKind: ExternalTmsProviderKind | null | undefined,
) {
  return providerKind == null || providerKind === "crowdin";
}

export function normalizeCatSourcePathParam(sourcePath: string | null | undefined) {
  const trimmed = sourcePath?.trim() ?? "";
  if (!trimmed || trimmed === CAT_ALL_FILES_SOURCE_PATH) {
    return CAT_ALL_FILES_SOURCE_PATH;
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

export function serializeCatSourcePathsFilter(sourcePaths: readonly string[]) {
  return sourcePaths
    .map((path) => path.trim())
    .filter(Boolean)
    .join(",");
}
