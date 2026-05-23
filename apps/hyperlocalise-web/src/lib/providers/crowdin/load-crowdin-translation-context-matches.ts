import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";

import { CrowdinApiClient } from "./crowdin-api";
import {
  mergeTranslationContextMatches,
  normalizeCrowdinGlossaryConcordanceMatches,
  normalizeCrowdinTranslationMemoryConcordanceMatches,
} from "./normalize-crowdin-context-matches";

const maxConcordanceExpressions = 1;

export async function loadCrowdinTranslationContextMatches(input: {
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
}) {
  const [project] = await db
    .select({
      id: schema.projects.id,
      organizationId: schema.projects.organizationId,
      externalProviderKind: schema.projects.externalProviderKind,
      externalProjectId: schema.projects.externalProjectId,
      externalProviderCredentialId: schema.projects.externalProviderCredentialId,
      source: schema.projects.source,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, input.projectId))
    .limit(1);

  if (
    !project ||
    project.source !== "external_tms" ||
    project.externalProviderKind !== "crowdin" ||
    !project.externalProjectId ||
    !project.externalProviderCredentialId
  ) {
    return {
      glossaryTerms: [],
      translationMemoryMatches: [],
    };
  }

  const [credential] = await db
    .select()
    .from(schema.organizationExternalTmsProviderCredentials)
    .where(
      and(
        eq(
          schema.organizationExternalTmsProviderCredentials.id,
          project.externalProviderCredentialId,
        ),
        eq(
          schema.organizationExternalTmsProviderCredentials.organizationId,
          project.organizationId,
        ),
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
      ),
    )
    .limit(1);

  if (!credential) {
    return {
      glossaryTerms: [],
      translationMemoryMatches: [],
    };
  }

  const secretMaterial = decryptProviderCredential({
    algorithm: credential.encryptionAlgorithm,
    keyVersion: credential.keyVersion,
    ciphertext: credential.ciphertext,
    iv: credential.iv,
    authTag: credential.authTag,
  });

  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  const crowdinProjectId = Number(project.externalProjectId);
  if (!Number.isFinite(crowdinProjectId)) {
    return {
      glossaryTerms: [],
      translationMemoryMatches: [],
    };
  }

  const expressions = [input.sourceText.trim()].filter(Boolean).slice(0, maxConcordanceExpressions);
  if (expressions.length === 0) {
    return {
      glossaryTerms: [],
      translationMemoryMatches: [],
    };
  }

  const glossaryMatchesByLocale: Awaited<
    ReturnType<typeof normalizeCrowdinGlossaryConcordanceMatches>
  >[] = [];
  const memoryMatchesByLocale: Awaited<
    ReturnType<typeof normalizeCrowdinTranslationMemoryConcordanceMatches>
  >[] = [];

  for (const targetLocale of input.targetLocales) {
    const [glossaryConcordance, memoryConcordance] = await Promise.all([
      client
        .searchGlossaryConcordance(crowdinProjectId, {
          sourceLanguageId: input.sourceLocale,
          targetLanguageId: targetLocale,
          expressions,
        })
        .catch(() => []),
      client
        .searchTranslationMemoryConcordance(crowdinProjectId, {
          sourceLanguageId: input.sourceLocale,
          targetLanguageId: targetLocale,
          expressions,
        })
        .catch(() => []),
    ]);

    glossaryMatchesByLocale.push(
      normalizeCrowdinGlossaryConcordanceMatches(glossaryConcordance, { targetLocale }),
    );
    memoryMatchesByLocale.push(
      normalizeCrowdinTranslationMemoryConcordanceMatches(memoryConcordance, { targetLocale }),
    );
  }

  return {
    glossaryTerms: mergeTranslationContextMatches([], glossaryMatchesByLocale.flat(), 20),
    translationMemoryMatches: mergeTranslationContextMatches([], memoryMatchesByLocale.flat(), 10),
  };
}
