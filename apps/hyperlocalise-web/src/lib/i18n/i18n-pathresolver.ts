import { isSafeRepositoryRelativePath } from "./safe-repository-path";

const TOKEN_SOURCE = "{{source}}";
const TOKEN_TARGET = "{{target}}";
const TOKEN_LOCALE_DIR = "{{localeDir}}";
const LEGACY_LOCALE = "[locale]";

function resolve(pattern: string, sourceLocale: string, targetLocale: string): string {
  const localeDir = sourceLocale === targetLocale ? "" : targetLocale;

  let path = pattern.replaceAll(TOKEN_SOURCE, sourceLocale);
  path = path.replaceAll(TOKEN_TARGET, targetLocale);
  path = path.replaceAll(TOKEN_LOCALE_DIR, localeDir);
  path = path.replaceAll(LEGACY_LOCALE, targetLocale);

  while (path.includes("//")) {
    path = path.replaceAll("//", "/");
  }

  if (!isSafeRepositoryRelativePath(path)) {
    throw new Error(`Unsafe repository path: ${path}`);
  }

  return path;
}

export function resolveSourcePath(pattern: string, sourceLocale: string): string {
  return resolve(pattern, sourceLocale, sourceLocale);
}

export function resolveTargetPath(
  pattern: string,
  sourceLocale: string,
  targetLocale: string,
): string {
  return resolve(pattern, sourceLocale, targetLocale);
}
