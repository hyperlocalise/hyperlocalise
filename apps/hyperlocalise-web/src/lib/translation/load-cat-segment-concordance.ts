import type { CatGlossaryTerm, CatTranslationMemoryMatch } from "@/components/cat/types";
import { searchCrowdinCatConcordance } from "@/lib/providers/adapters/crowdin/crowdin-cat-concordance";
import { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { NormalizedTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import {
  defaultGlossaryMatchResolution,
  defaultTranslationMemoryMatchResolution,
} from "@/lib/providers/match-resolution";
import { getActiveOrganizationExternalTmsProviderCredentialRow } from "@/lib/providers/organization-external-tms-provider-credentials";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { loadGlossaryMatchesForContext } from "@/lib/translation/load-glossary-matches";
import { loadTranslationMemoryMatchesForContext } from "@/lib/translation/load-translation-memory-matches";

import type { CatAiRecommendationInput } from "./generate-cat-ai-recommendation";

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
  };
}

function toCatTranslationMemoryMatch(
  match: NormalizedTranslationMemoryMatch,
): CatTranslationMemoryMatch {
  return {
    id: match.id,
    sourceText: match.sourceText,
    targetText: match.targetText,
    matchPercent: match.matchScore ?? 0,
    contextLabel: match.memoryName,
  };
}

async function loadCrowdinLiveConcordance(input: {
  organizationId: string;
  externalProjectId: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
}): Promise<{
  glossaryTerms: NormalizedGlossaryMatch[];
  translationMemoryMatches: NormalizedTranslationMemoryMatch[];
}> {
  const credential = await getActiveOrganizationExternalTmsProviderCredentialRow(
    input.organizationId,
  );
  if (!credential || credential.providerKind !== "crowdin") {
    return { glossaryTerms: [], translationMemoryMatches: [] };
  }

  const secretMaterial = unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: credential.encryptionAlgorithm,
      keyVersion: credential.keyVersion,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    }),
  );

  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  return searchCrowdinCatConcordance({
    client,
    externalProjectId: input.externalProjectId,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    sourceText: input.sourceText,
  });
}

export async function loadCatSegmentConcordance(input: {
  organizationId: string;
  projectId: string;
  providerKind?: ExternalTmsProviderKind | null;
  externalProjectId?: string | null;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
}): Promise<CatSegmentConcordance> {
  if (input.providerKind === "crowdin" && input.externalProjectId) {
    const liveMatches = await loadCrowdinLiveConcordance({
      organizationId: input.organizationId,
      externalProjectId: input.externalProjectId,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceText: input.sourceText,
    });

    return {
      glossaryTerms: liveMatches.glossaryTerms.map(toCatGlossaryTerm),
      translationMemoryMatches: liveMatches.translationMemoryMatches.map(
        toCatTranslationMemoryMatch,
      ),
    };
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
      toCatTranslationMemoryMatch(match),
    ),
  };
}

export function mapCatConcordanceForAiRecommendation(
  concordance: CatSegmentConcordance,
  targetLocale: string,
): Pick<CatAiRecommendationInput, "glossaryTerms" | "translationMemoryMatches"> {
  return {
    glossaryTerms: concordance.glossaryTerms.map((term) => ({
      sourceTerm: term.source,
      targetTerm: term.target,
      targetLocale,
      forbidden: term.approved ? false : null,
      description: null,
    })),
    translationMemoryMatches: concordance.translationMemoryMatches.map((match) => ({
      sourceText: match.sourceText,
      targetText: match.targetText,
      targetLocale,
    })),
  };
}
