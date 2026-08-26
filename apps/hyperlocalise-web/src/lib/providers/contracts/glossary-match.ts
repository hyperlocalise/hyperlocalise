/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import {
  normalizeProviderGlossaryTermFlags,
  normalizedGlossaryTermStatusFromStatus,
  type ProviderGlossaryTermStatusInput,
} from "@/lib/providers/contracts/glossary-term-status";

export type GlossaryMatchSource = "synced_database" | "live_provider";

export type NormalizedGlossaryTermStatus = {
  forbidden: boolean;
  preferred: boolean;
};

export type NormalizedGlossaryConceptTerm = {
  id: string;
  locale: string;
  text: string;
  status?: string | null;
  forbidden?: boolean;
  preferred?: boolean;
  termType?: string | null;
  partOfSpeech?: string | null;
  gender?: string | null;
};

export type NormalizedGlossaryConcept = {
  id: string;
  primaryTerm: string;
  subject?: string | null;
  definition?: string | null;
  glossaryUrl?: string | null;
  sourceTerms: NormalizedGlossaryConceptTerm[];
  targetTerms: NormalizedGlossaryConceptTerm[];
};

export type NormalizedGlossaryMatch = {
  id: string;
  glossaryId: string;
  glossaryName: string;
  sourceTerm: string;
  targetTerm: string;
  sourceLocale: string;
  targetLocale: string;
  description: string | null;
  caseSensitive: boolean;
  rank: number;
  matchSource: GlossaryMatchSource;
  providerKind: ExternalTmsProviderKind | null;
  resourceId: string;
  externalResourceId: string | null;
  externalTermId: string | null;
  externalConceptId?: string | null;
  termStatus: NormalizedGlossaryTermStatus;
  concept?: NormalizedGlossaryConcept;
};

export type ContextGlossaryMatch = {
  id: string;
  glossaryId: string;
  glossaryName: string;
  sourceTerm: string;
  targetTerm: string;
  targetLocale: string;
  description: string | null;
  forbidden: boolean | null;
  caseSensitive: boolean | null;
  rank: number;
  matchSource: GlossaryMatchSource;
  providerKind: ExternalTmsProviderKind | null;
  resourceId: string;
  externalResourceId: string | null;
};

export type AgentRunGlossaryMatchUsage = {
  glossaryId: string;
  glossaryName: string;
  sourceTerm: string;
  targetTerm: string;
  targetLocale: string;
  forbidden: boolean;
  preferred: boolean;
  matchSource: GlossaryMatchSource;
  providerKind: ExternalTmsProviderKind | null;
  resourceId: string;
  externalResourceId: string | null;
};

export type ProviderGlossaryMatchInput = {
  sourceTerm: string;
  targetTerm: string;
  sourceLocale: string;
  targetLocale: string;
  description?: string | null;
  caseSensitive?: boolean;
  providerKind: ExternalTmsProviderKind;
  resourceId: string;
  externalResourceId?: string | null;
  externalTermId?: string | null;
  externalConceptId?: string | null;
  glossaryName: string;
  rank?: number;
  status?: ProviderGlossaryTermStatusInput;
  concept?: NormalizedGlossaryConcept;
};

export function normalizeGlossaryTermStatus(
  input: ProviderGlossaryTermStatusInput,
): NormalizedGlossaryTermStatus {
  const { forbidden } = normalizeProviderGlossaryTermFlags(input);
  const status = input.status?.trim();
  const preferred = status
    ? normalizedGlossaryTermStatusFromStatus(status).preferred
    : input.forbidden === false;
  return {
    forbidden,
    preferred: forbidden ? false : preferred,
  };
}

export function normalizeProviderGlossaryMatch(
  input: ProviderGlossaryMatchInput,
): NormalizedGlossaryMatch {
  const externalResourceId = input.externalResourceId ?? null;
  const externalTermId = input.externalTermId ?? null;
  const externalConceptId = input.externalConceptId ?? null;
  const rank = input.rank ?? 1;
  const termStatus = normalizeGlossaryTermStatus(input.status ?? {});

  return {
    id: `live:${input.providerKind}:${externalResourceId ?? input.resourceId}:${externalTermId ?? input.sourceTerm}:${input.targetLocale}`,
    glossaryId: input.resourceId,
    glossaryName: input.glossaryName,
    sourceTerm: input.sourceTerm,
    targetTerm: input.targetTerm,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    description: input.description ?? null,
    caseSensitive: input.caseSensitive ?? false,
    rank,
    matchSource: "live_provider",
    providerKind: input.providerKind,
    resourceId: input.resourceId,
    externalResourceId,
    externalTermId,
    ...(externalConceptId ? { externalConceptId } : {}),
    termStatus,
    ...(input.concept ? { concept: input.concept } : {}),
  };
}

export function normalizeSyncedDatabaseGlossaryMatch(input: {
  id: string;
  glossaryId: string;
  glossaryName: string;
  sourceTerm: string;
  targetTerm: string;
  sourceLocale: string;
  targetLocale: string;
  description: string | null;
  forbidden: boolean;
  preferred?: boolean;
  caseSensitive: boolean;
  rank: number;
  providerKind: ExternalTmsProviderKind | null;
  externalResourceId: string | null;
  externalTermId: string | null;
  concept?: NormalizedGlossaryConcept;
}): NormalizedGlossaryMatch {
  return {
    id: input.id,
    glossaryId: input.glossaryId,
    glossaryName: input.glossaryName,
    sourceTerm: input.sourceTerm,
    targetTerm: input.targetTerm,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    description: input.description,
    caseSensitive: input.caseSensitive,
    rank: input.rank,
    matchSource: "synced_database",
    providerKind: input.providerKind,
    resourceId: input.glossaryId,
    externalResourceId: input.externalResourceId,
    externalTermId: input.externalTermId,
    termStatus: {
      forbidden: input.forbidden,
      preferred: input.preferred ?? false,
    },
    ...(input.concept ? { concept: input.concept } : {}),
  };
}

export function toContextGlossaryMatch(match: NormalizedGlossaryMatch): ContextGlossaryMatch {
  return {
    id: match.id,
    glossaryId: match.glossaryId,
    glossaryName: match.glossaryName,
    sourceTerm: match.sourceTerm,
    targetTerm: match.targetTerm,
    targetLocale: match.targetLocale,
    description: match.description,
    forbidden: match.termStatus.forbidden,
    caseSensitive: match.caseSensitive,
    rank: match.rank,
    matchSource: match.matchSource,
    providerKind: match.providerKind,
    resourceId: match.resourceId,
    externalResourceId: match.externalResourceId,
  };
}

export function toAgentRunGlossaryMatchUsage(
  match: NormalizedGlossaryMatch,
): AgentRunGlossaryMatchUsage {
  return {
    glossaryId: match.glossaryId,
    glossaryName: match.glossaryName,
    sourceTerm: match.sourceTerm,
    targetTerm: match.targetTerm,
    targetLocale: match.targetLocale,
    forbidden: match.termStatus.forbidden,
    preferred: match.termStatus.preferred,
    matchSource: match.matchSource,
    providerKind: match.providerKind,
    resourceId: match.resourceId,
    externalResourceId: match.externalResourceId,
  };
}

export function mergeGlossaryMatches(
  matches: NormalizedGlossaryMatch[],
  limit = 20,
): NormalizedGlossaryMatch[] {
  const byKey = new Map<string, NormalizedGlossaryMatch>();

  for (const match of matches) {
    const key = `${match.glossaryId}\x00${match.targetLocale}\x00${match.sourceTerm}\x00${match.targetTerm}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, match);
      continue;
    }

    if (existing.matchSource === "live_provider" && match.matchSource === "synced_database") {
      byKey.set(key, match);
      continue;
    }

    if (existing.matchSource === "synced_database" && match.matchSource === "live_provider") {
      continue;
    }

    if (match.rank > existing.rank) {
      byKey.set(key, match);
    }
  }

  return [...byKey.values()].toSorted((left, right) => right.rank - left.rank).slice(0, limit);
}
