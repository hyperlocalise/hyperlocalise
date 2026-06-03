export function normalizeRepositoryRelativePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

export function isSafeRepositoryRelativePath(path: string): boolean {
  const trimmed = path.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return false;
  }

  const normalized = normalizeRepositoryRelativePath(path);
  if (!normalized || normalized === ".") {
    return false;
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    return false;
  }

  if (normalized === ".git" || normalized.startsWith(".git/") || segments.includes(".git")) {
    return false;
  }

  return true;
}
