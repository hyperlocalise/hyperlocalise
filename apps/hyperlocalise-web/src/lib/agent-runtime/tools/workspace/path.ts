/**
 * Normalize a workspace-relative path. Returns null when the path escapes the repo root.
 */
export function normalizeWorkspacePath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    return null;
  }
  return normalized;
}
