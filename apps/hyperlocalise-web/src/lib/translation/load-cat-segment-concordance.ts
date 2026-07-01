import type { CatGlossaryTerm, CatTranslationMemoryMatch } from "@/components/cat/types";
import { inferTmMatchKind } from "@/components/cat/tm-match-quality";
import { searchCrowdinCatConcordance } from "@/lib/providers/adapters/crowdin/crowdin-cat-concordance";
import { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import {
  decryptCrowdinCredentialToken,
  loadCrowdinProjectCredential,
} from "@/lib/providers/adapters/crowdin/load-crowdin-project-credential";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { NormalizedTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import {
  defaultGlossaryMatchResolution,
  defaultTranslationMemoryMatchResolution,
} from "@/lib/providers/match-resolution";
import { loadGlossaryMatchesForContext } from "@/lib/translation/load-glossary-matches";
import { loadTranslationMemoryMatchesForContext } from "@/lib/translation/load-translation-memory-matches";

export type { CatConcordanceForAiRecommendation } from "./map-cat-concordance-for-ai-recommendation";
export { mapCatConcordanceForAiRecommendation } from "./map-cat-concordance-for-ai-recommendation";

export type CatSegmentConcordance = {
  glossaryTerms: CatGlossaryTerm[];
  translationMemoryMatches: CatTranslationMemoryMatch[];
};

function toCatGlossaryTerm(match: NormalizedGlossaryMatch): CatGlossaryTerm {
  return {
    id: match.id,
    source: match.sourceTerm,
    target: match.targetTerm,
    approved: match.termStatus.preferred,
    forbidden: match.termStatus.forbidden,
  };
}

function toCatTranslationMemoryMatch(
  match: NormalizedTranslationMemoryMatch,
  querySourceText: string,
): CatTranslationMemoryMatch {
  const matchPercent = match.matchScore ?? 0;

  return {
    id: match.id,
    sourceText: match.sourceText,
    targetText: match.targetText,
    matchPercent,
    matchKind: inferTmMatchKind(matchPercent, querySourceText, match.sourceText),
    contextLabel: match.memoryName,
  };
}

type CrowdinLiveConcordance = {
  glossaryTerms: NormalizedGlossaryMatch[];
  translationMemoryMatches: NormalizedTranslationMemoryMatch[];
};

async function loadCrowdinLiveConcordance(input: {
  organizationId: string;
  projectId: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
}): Promise<CrowdinLiveConcordance | null> {
  const projectCredential = await loadCrowdinProjectCredential({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  if (!projectCredential) {
    return null;
  }

  const { credential, externalProjectId } = projectCredential;
  const client = new CrowdinApiClient({
    token: decryptCrowdinCredentialToken(credential),
    baseUrl: credential.baseUrl ?? undefined,
  });

  return searchCrowdinCatConcordance({
    client,
    externalProjectId,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    sourceText: input.sourceText,
  });
}

export async function loadCatSegmentConcordance(input: {
  organizationId: string;
  projectId: string;
  providerKind?: ExternalTmsProviderKind | null;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
}): Promise<CatSegmentConcordance> {
  if (input.providerKind === "crowdin") {
    const liveMatches = await loadCrowdinLiveConcordance({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceText: input.sourceText,
    });

    if (liveMatches) {
      return {
        glossaryTerms: liveMatches.glossaryTerms.map(toCatGlossaryTerm),
        translationMemoryMatches: liveMatches.translationMemoryMatches.map((match) =>
          toCatTranslationMemoryMatch(match, input.sourceText),
        ),
      };
    }
  }

  const [glossaryMatches, translationMemoryMatches] = await Promise.all([
    loadGlossaryMatchesForContext({
      projectId: input.projectId,
      organizationId: input.organizationId,
      providerKind: input.providerKind ?? undefined,
      sourceLocale: input.sourceLocale,
      targetLocales: [input.targetLocale],
      sourceText: input.sourceText,
      glossaryMatchResolution: defaultGlossaryMatchResolution,
    }),
    loadTranslationMemoryMatchesForContext({
      projectId: input.projectId,
      organizationId: input.organizationId,
      providerKind: input.providerKind ?? undefined,
      sourceLocale: input.sourceLocale,
      targetLocales: [input.targetLocale],
      sourceText: input.sourceText,
      translationMemoryMatchResolution: defaultTranslationMemoryMatchResolution,
    }),
  ]);

  return {
    glossaryTerms: glossaryMatches.map((match) => toCatGlossaryTerm(match)),
    translationMemoryMatches: translationMemoryMatches.map((match) =>
      toCatTranslationMemoryMatch(match, input.sourceText),
    ),
  };
}
