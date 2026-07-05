import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import { normalizeProviderGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { NormalizedTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import { normalizeProviderTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import { TmsProviderLiveError } from "@/lib/providers/tms-provider-live";

import { LokaliseApiClient, LokaliseApiError, LOKALISE_TM_SYNC_MAX_KEYS } from "./lokalise-api";
import {
  buildLokaliseProjectGlossaryExternalId,
  buildLokaliseProjectTranslationMemoryExternalId,
  buildLokaliseTranslationMemorySegmentCandidates,
  matchesLokaliseGlossaryTerm,
  pickLokaliseGlossaryTranslation,
} from "./normalize-lokalise-context-matches";

function rethrowLokaliseConcordanceApiError(error: unknown): never {
  if (error instanceof LokaliseApiError) {
    if (error.status === 401 || error.status === 403) {
      throw new TmsProviderLiveError(
        "lokalise_auth_invalid",
        "Lokalise credentials are invalid or lack permission for this project.",
      );
    }
    if (error.status === 404) {
      throw new TmsProviderLiveError(
        "invalid_lokalise_project_id",
        "The Lokalise project could not be found.",
      );
    }
    throw new TmsProviderLiveError(
      "provider_fetch_failed",
      "Failed to fetch glossary and translation memory from Lokalise.",
    );
  }

  if (error instanceof Error && error.message === "lokalise_auth_invalid") {
    throw new TmsProviderLiveError("lokalise_auth_invalid", "Lokalise credentials are invalid.");
  }

  throw error;
}

export async function searchLokaliseCatConcordance(input: {
  client: LokaliseApiClient;
  externalProjectId: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  glossaryLimit?: number;
  translationMemoryLimit?: number;
}): Promise<{
  glossaryTerms: NormalizedGlossaryMatch[];
  translationMemoryMatches: NormalizedTranslationMemoryMatch[];
}> {
  const projectId = input.externalProjectId.trim();
  if (!projectId) {
    return { glossaryTerms: [], translationMemoryMatches: [] };
  }

  const glossaryLimit = input.glossaryLimit ?? 20;
  const translationMemoryLimit = input.translationMemoryLimit ?? 10;
  const externalGlossaryId = buildLokaliseProjectGlossaryExternalId(projectId);
  const externalMemoryId = buildLokaliseProjectTranslationMemoryExternalId(projectId);
  const glossaryName = `Lokalise glossary (${projectId})`;
  const memoryName = `Lokalise translation memory (${projectId})`;

  let terms: Awaited<ReturnType<LokaliseApiClient["listGlossaryTerms"]>>;
  let languages: Awaited<ReturnType<LokaliseApiClient["listProjectLanguages"]>>;
  let keys: Awaited<ReturnType<LokaliseApiClient["listKeys"]>>;

  try {
    [terms, languages, keys] = await Promise.all([
      input.client.listGlossaryTerms(projectId),
      input.client.listProjectLanguages(projectId),
      input.client.listKeys(projectId, { includeTranslations: true }),
    ]);
  } catch (error) {
    rethrowLokaliseConcordanceApiError(error);
  }

  const languageIsoById = new Map(
    languages
      .filter((language) => language.langId > 0 && language.langIso.trim())
      .map((language) => [language.langId, language.langIso.trim()] as const),
  );

  const glossaryTerms: NormalizedGlossaryMatch[] = [];
  for (const [index, term] of terms.entries()) {
    if (!matchesLokaliseGlossaryTerm(input.sourceText, term)) {
      continue;
    }

    const sourceTerm = term.term.trim();
    const targetTerm = pickLokaliseGlossaryTranslation(term, input.targetLocale, languageIsoById);
    if (!sourceTerm || !targetTerm) {
      continue;
    }

    glossaryTerms.push(
      normalizeProviderGlossaryMatch({
        sourceTerm,
        targetTerm,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        description: term.description,
        caseSensitive: term.caseSensitive,
        providerKind: "lokalise",
        resourceId: externalGlossaryId,
        externalResourceId: externalGlossaryId,
        externalTermId: String(term.id),
        glossaryName,
        rank: 1 - index * 0.01,
        status: {
          forbidden: term.forbidden,
        },
      }),
    );
  }

  const tmCandidates = buildLokaliseTranslationMemorySegmentCandidates(
    keys.slice(0, LOKALISE_TM_SYNC_MAX_KEYS),
    {
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceText: input.sourceText,
      limit: translationMemoryLimit,
    },
  );

  const translationMemoryMatches = tmCandidates.map((candidate, index) =>
    normalizeProviderTranslationMemoryMatch({
      sourceText: candidate.sourceText,
      targetText: candidate.targetText,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      matchScore: candidate.matchScore,
      providerKind: "lokalise",
      resourceId: externalMemoryId,
      externalResourceId: externalMemoryId,
      externalSegmentId: String(candidate.keyId),
      memoryName,
      rank: 1 - index * 0.01,
    }),
  );

  return {
    glossaryTerms: glossaryTerms
      .toSorted((left, right) => right.rank - left.rank)
      .slice(0, glossaryLimit),
    translationMemoryMatches,
  };
}
