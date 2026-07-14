import type { CatTmMatchKind } from "@/components/cat/shared/types";

export const TM_LOW_MATCH_CONFIRM_THRESHOLD = 70;

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
