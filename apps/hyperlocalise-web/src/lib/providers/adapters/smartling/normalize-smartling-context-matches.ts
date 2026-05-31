import type { SmartlingGlossaryEntry, SmartlingTranslationMemoryEntry } from "./smartling-api";
import { pickSmartlingGlossaryTranslation, scoreSmartlingTextMatch } from "./smartling-api";

export function matchesSmartlingGlossaryEntry(sourceText: string, entry: SmartlingGlossaryEntry) {
  return scoreSmartlingTextMatch(sourceText, entry.term) >= 55;
}

export function buildSmartlingTranslationMemoryCandidates(
  entries: SmartlingTranslationMemoryEntry[],
  input: {
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
    limit: number;
  },
) {
  const candidates: Array<{
    entryUid: string;
    sourceText: string;
    targetText: string;
    matchScore: number;
  }> = [];

  for (const entry of entries) {
    const sourceText = entry.sourceText.trim();
    if (!sourceText) {
      continue;
    }

    const matchScore = scoreSmartlingTextMatch(input.sourceText, sourceText);
    if (matchScore < 55) {
      continue;
    }

    const translation = entry.translations.find(
      (item) => item.targetLocaleId.trim() === input.targetLocale.trim(),
    );
    const targetText = translation?.translationText.trim();
    if (!targetText) {
      continue;
    }

    candidates.push({
      entryUid: entry.entryUid,
      sourceText,
      targetText,
      matchScore,
    });
  }

  return candidates
    .toSorted((left, right) => right.matchScore - left.matchScore)
    .slice(0, input.limit);
}

export { pickSmartlingGlossaryTranslation, scoreSmartlingTextMatch };
