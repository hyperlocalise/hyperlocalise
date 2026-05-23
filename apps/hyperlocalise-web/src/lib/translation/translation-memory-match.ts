import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";

export type TranslationMemoryMatchSource = "synced_database" | "live_provider";

export type NormalizedTranslationMemoryMatch = {
  id: string;
  memoryId: string;
  memoryName: string;
  sourceText: string;
  targetText: string;
  sourceLocale: string;
  targetLocale: string;
  matchScore: number | null;
  provenance: string | null;
  rank: number;
  matchSource: TranslationMemoryMatchSource;
  providerKind: ExternalTmsProviderKind | null;
  resourceId: string;
  externalResourceId: string | null;
  externalSegmentId: string | null;
};

export type ContextTranslationMemoryMatch = {
  id: string;
  memoryId: string;
  memoryName: string;
  sourceText: string;
  targetText: string;
  targetLocale: string;
  provenance: string | null;
  matchScore: number | null;
  rank: number;
  matchSource: TranslationMemoryMatchSource;
  providerKind: ExternalTmsProviderKind | null;
  resourceId: string;
  externalResourceId: string | null;
};

export type AgentRunTranslationMemoryMatchUsage = {
  memoryId: string;
  memoryName: string;
  sourceText: string;
  targetText: string;
  targetLocale: string;
  matchScore: number | null;
  matchSource: TranslationMemoryMatchSource;
  providerKind: ExternalTmsProviderKind | null;
  resourceId: string;
  externalResourceId: string | null;
};

export type ProviderTranslationMemoryMatchInput = {
  sourceText: string;
  targetText: string;
  sourceLocale: string;
  targetLocale: string;
  matchScore?: number | null;
  providerKind: ExternalTmsProviderKind;
  resourceId: string;
  externalResourceId?: string | null;
  externalSegmentId?: string | null;
  memoryName: string;
  rank?: number;
};

function clampMatchScore(score: number | null | undefined): number | null {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizeProviderTranslationMemoryMatch(
  input: ProviderTranslationMemoryMatchInput,
): NormalizedTranslationMemoryMatch {
  const externalResourceId = input.externalResourceId ?? null;
  const externalSegmentId = input.externalSegmentId ?? null;
  const rank = input.rank ?? 1;

  return {
    id: `live:${input.providerKind}:${externalResourceId ?? input.resourceId}:${externalSegmentId ?? input.sourceText}:${input.targetLocale}`,
    memoryId: input.resourceId,
    memoryName: input.memoryName,
    sourceText: input.sourceText,
    targetText: input.targetText,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    matchScore: clampMatchScore(input.matchScore),
    provenance: "live_provider",
    rank,
    matchSource: "live_provider",
    providerKind: input.providerKind,
    resourceId: input.resourceId,
    externalResourceId,
    externalSegmentId,
  };
}

export function normalizeSyncedDatabaseTranslationMemoryMatch(input: {
  id: string;
  memoryId: string;
  memoryName: string;
  sourceText: string;
  targetText: string;
  sourceLocale: string;
  targetLocale: string;
  matchScore: number | null;
  provenance: string | null;
  rank: number;
  providerKind: ExternalTmsProviderKind | null;
  externalResourceId: string | null;
  externalSegmentId: string | null;
}): NormalizedTranslationMemoryMatch {
  return {
    id: input.id,
    memoryId: input.memoryId,
    memoryName: input.memoryName,
    sourceText: input.sourceText,
    targetText: input.targetText,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    matchScore: clampMatchScore(input.matchScore),
    provenance: input.provenance,
    rank: input.rank,
    matchSource: "synced_database",
    providerKind: input.providerKind,
    resourceId: input.memoryId,
    externalResourceId: input.externalResourceId,
    externalSegmentId: input.externalSegmentId,
  };
}

export function toContextTranslationMemoryMatch(
  match: NormalizedTranslationMemoryMatch,
): ContextTranslationMemoryMatch {
  return {
    id: match.id,
    memoryId: match.memoryId,
    memoryName: match.memoryName,
    sourceText: match.sourceText,
    targetText: match.targetText,
    targetLocale: match.targetLocale,
    provenance: match.provenance,
    matchScore: match.matchScore,
    rank: match.rank,
    matchSource: match.matchSource,
    providerKind: match.providerKind,
    resourceId: match.resourceId,
    externalResourceId: match.externalResourceId,
  };
}

export function toAgentRunTranslationMemoryMatchUsage(
  match: NormalizedTranslationMemoryMatch,
): AgentRunTranslationMemoryMatchUsage {
  return {
    memoryId: match.memoryId,
    memoryName: match.memoryName,
    sourceText: match.sourceText,
    targetText: match.targetText,
    targetLocale: match.targetLocale,
    matchScore: match.matchScore,
    matchSource: match.matchSource,
    providerKind: match.providerKind,
    resourceId: match.resourceId,
    externalResourceId: match.externalResourceId,
  };
}

export function mergeTranslationMemoryMatches(
  matches: NormalizedTranslationMemoryMatch[],
  limit = 10,
): NormalizedTranslationMemoryMatch[] {
  const byKey = new Map<string, NormalizedTranslationMemoryMatch>();

  for (const match of matches) {
    const key = `${match.memoryId}:${match.targetLocale}:${match.sourceText}:${match.targetText}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, match);
      continue;
    }

    if (existing.matchSource === "live_provider" && match.matchSource === "synced_database") {
      byKey.set(key, match);
      continue;
    }

    // Never let a live_provider result overwrite an already-stored synced_database entry.
    if (existing.matchSource === "synced_database" && match.matchSource === "live_provider") {
      continue;
    }

    if (match.rank > existing.rank || (match.matchScore ?? 0) > (existing.matchScore ?? 0)) {
      byKey.set(key, match);
    }
  }

  return [...byKey.values()]
    .toSorted((left, right) => {
      if (right.rank !== left.rank) {
        return right.rank - left.rank;
      }
      return (right.matchScore ?? 0) - (left.matchScore ?? 0);
    })
    .slice(0, limit);
}
