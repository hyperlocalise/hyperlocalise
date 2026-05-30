/**
 * Normalize a workspace-relative path. Returns null when the path escapes the repo root.
 */
export function normalizeWorkspacePath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    return null;
  }
  if (normalized.split("/").some((segment) => segment.startsWith("-"))) {
    return null;
  }
  return normalized;
}

/** Prefix paths so shell tools like `find` treat them as relative paths, not flags. */
export function toShellRelativePath(normalizedPath: string): string {
  if (normalizedPath === ".") {
    return ".";
  }
  return normalizedPath.startsWith("-") ? `./${normalizedPath}` : normalizedPath;
}
