import type { CatGlossaryTerm, CatTranslationMemoryMatch } from "@/components/cat/types";
import { inferTmMatchKind } from "@/components/cat/tm-match-quality";
import { searchCrowdinCatConcordance } from "@/lib/providers/adapters/crowdin/crowdin-cat-concordance";
import { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import type { ExternalTmsProviderKind } from "@/lib/providers/contracts/external-tms-provider-kind";
import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { NormalizedTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import {
  defaultGlossaryMatchResolution,
  defaultTranslationMemoryMatchResolution,
} from "@/lib/providers/match-resolution";
import { loadGlossaryMatchesForContext } from "@/lib/translation/load-glossary-matches";
import { loadTranslationMemoryMatchesForContext } from "@/lib/translation/load-translation-memory-matches";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { db, schema } from "@/lib/database";
import { and, eq } from "drizzle-orm";

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

async function loadCrowdinProjectCredential(input: { organizationId: string; projectId: string }) {
  const [project] = await db
    .select({
      externalProjectId: schema.projects.externalProjectId,
      externalProviderCredentialId: schema.projects.externalProviderCredentialId,
      externalProviderKind: schema.projects.externalProviderKind,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.externalProviderKind, "crowdin"),
        eq(schema.projects.source, "external_tms"),
      ),
    )
    .limit(1);

  if (!project?.externalProjectId || !project.externalProviderCredentialId) {
    return null;
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(schema.organizationExternalTmsProviderCredentials.organizationId, input.organizationId),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
        eq(
          schema.organizationExternalTmsProviderCredentials.id,
          project.externalProviderCredentialId,
        ),
      ),
    )
    .limit(1);

  if (!credential) {
    return null;
  }

  return {
    externalProjectId: project.externalProjectId,
    credential,
  };
}

async function loadCrowdinLiveConcordance(input: {
  organizationId: string;
  projectId: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
}): Promise<{
  glossaryTerms: NormalizedGlossaryMatch[];
  translationMemoryMatches: NormalizedTranslationMemoryMatch[];
}> {
  const projectCredential = await loadCrowdinProjectCredential({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  if (!projectCredential) {
    return { glossaryTerms: [], translationMemoryMatches: [] };
  }

  const { credential, externalProjectId } = projectCredential;
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
  externalProjectId?: string | null;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
}): Promise<CatSegmentConcordance> {
  if (input.providerKind === "crowdin" && input.externalProjectId) {
    const liveMatches = await loadCrowdinLiveConcordance({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      sourceText: input.sourceText,
    });

    return {
      glossaryTerms: liveMatches.glossaryTerms.map(toCatGlossaryTerm),
      translationMemoryMatches: liveMatches.translationMemoryMatches.map((match) =>
        toCatTranslationMemoryMatch(match, input.sourceText),
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
      toCatTranslationMemoryMatch(match, input.sourceText),
    ),
  };
}
