export const FILE_TRANSLATION_MAX_TRANSLATIONS_PER_SESSION = 1000;
export const FILE_TRANSLATION_MAX_PAGES = 500;

/** Parse `deferred_by_limit=N` from `hl run` stdout. Missing marker means 0. */
export function parseDeferredByLimit(output: string): number {
  const match = /\bdeferred_by_limit=(\d+)\b/.exec(output);
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[1] ?? "0", 10) || 0;
}
