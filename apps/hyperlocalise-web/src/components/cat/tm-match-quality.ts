import type { CatTmMatchKind, CatTranslationMemoryMatch } from "./types";

export const TM_LOW_MATCH_CONFIRM_THRESHOLD = 70;
export const TM_AUTO_FILL_MIN_MATCH_PERCENT_DEFAULT = 100;

export function inferTmMatchKind(
  matchPercent: number,
  querySourceText: string,
  tmSourceText: string,
): CatTmMatchKind {
  if (matchPercent < 100) {
    return "fuzzy";
  }

  if (querySourceText.trim() === tmSourceText.trim()) {
    return "exact";
  }

  return "context";
}

export function requiresLowMatchConfirmation(matchPercent: number): boolean {
  return matchPercent < TM_LOW_MATCH_CONFIRM_THRESHOLD;
}

export function selectBestTmMatchForAutoFill(
  matches: CatTranslationMemoryMatch[] | undefined,
  minMatchPercent: number,
): CatTranslationMemoryMatch | undefined {
  if (!matches?.length) {
    return undefined;
  }

  const best = matches.toSorted((left, right) => right.matchPercent - left.matchPercent)[0];
  if (best.matchPercent >= minMatchPercent) {
    return best;
  }

  return undefined;
}
