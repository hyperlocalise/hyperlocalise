import type { StringTranslationContextSnapshot } from "@/lib/translation/assemble-translation-context";
import type { PhraseTmsSearchSegmentResult } from "@/lib/providers/phrase/phrase-tms-api";

export function normalizePhraseMatchScore(score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) {
    return null;
  }

  if (score <= 1) {
    return Math.max(0, Math.min(100, Math.round(score * 100)));
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizePhraseTranslationMemorySearchMatches(
  matches: PhraseTmsSearchSegmentResult[],
  input: {
    targetLocale: string;
    memoryIdByExternalUid: Map<string, string>;
    rankOffset?: number;
  },
): StringTranslationContextSnapshot["translationMemoryMatches"] {
  const normalized: StringTranslationContextSnapshot["translationMemoryMatches"] = [];
  let index = input.rankOffset ?? 0;

  for (const match of matches) {
    if (input.targetLocale && match.targetLocale && match.targetLocale !== input.targetLocale) {
      continue;
    }

    const externalMemoryUid = match.transMemoryUid;
    if (!externalMemoryUid) {
      continue;
    }

    const memoryId = input.memoryIdByExternalUid.get(externalMemoryUid);
    if (!memoryId) {
      continue;
    }

    normalized.push({
      id: `phrase:tm:${externalMemoryUid}:${match.segmentId ?? index}:${input.targetLocale}`,
      memoryId,
      memoryName: match.transMemoryName ?? externalMemoryUid,
      sourceText: match.sourceText,
      targetText: match.targetText,
      targetLocale: input.targetLocale,
      provenance: "phrase_tm_search",
      matchScore: normalizePhraseMatchScore(match.score),
      rank: Math.max(1, 100 - index),
      matchSource: "live_provider",
      providerKind: "phrase",
      resourceId: memoryId,
      externalResourceId: externalMemoryUid,
    });
    index += 1;
  }

  return normalized;
}
