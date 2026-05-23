import type { StringTranslationContextSnapshot } from "@/lib/translation/assemble-translation-context";
import type {
  PhraseTmsSearchSegmentResult,
  PhraseTmsTermBaseSearchResult,
} from "@/lib/providers/phrase/phrase-tms-api";

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

export function normalizePhraseTermBaseSearchMatches(
  matches: PhraseTmsTermBaseSearchResult[],
  input: { targetLocale: string; rankOffset?: number },
): StringTranslationContextSnapshot["glossaryTerms"] {
  const normalized: StringTranslationContextSnapshot["glossaryTerms"] = [];
  let index = input.rankOffset ?? 0;

  for (const match of matches) {
    if (input.targetLocale && match.targetLocale && match.targetLocale !== input.targetLocale) {
      continue;
    }

    const termBaseUid = match.termBaseUid;
    if (!termBaseUid) {
      continue;
    }

    normalized.push({
      id: `phrase:term-base:${termBaseUid}:${match.sourceTerm}:${input.targetLocale}`,
      glossaryId: `phrase:${termBaseUid}`,
      glossaryName: match.termBaseName ?? termBaseUid,
      sourceTerm: match.sourceTerm,
      targetTerm: match.targetTerm,
      targetLocale: input.targetLocale,
      description: match.description,
      forbidden: match.forbidden,
      rank: Math.max(1, 100 - index),
    });
    index += 1;
  }

  return normalized;
}

export function mergeTranslationContextMatches<T extends { id: string; rank: number }>(
  primary: T[],
  supplemental: T[],
  limit: number,
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of [...primary, ...supplemental]) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }

  return merged.sort((left, right) => right.rank - left.rank).slice(0, limit);
}
