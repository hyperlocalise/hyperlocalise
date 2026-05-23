import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { TranslationContextProjectRecord } from "@/lib/translation/assemble-translation-context";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";

import { resolvePhraseTmsProjectUid } from "./phrase-job-context";
import {
  mergeTranslationContextMatches,
  normalizePhraseTermBaseSearchMatches,
  normalizePhraseTranslationMemorySearchMatches,
} from "./normalize-phrase-context-matches";
import { PhraseTmsApiClient } from "./phrase-tms-api";

export async function loadPhraseTranslationContextMatches(input: {
  project: TranslationContextProjectRecord;
  externalJobUid?: string | null;
  sourceLocale: string;
  targetLocales: string[];
  sourceText: string;
}) {
  const { project } = input;

  if (
    project.source !== "external_tms" ||
    project.externalProviderKind !== "phrase" ||
    !project.externalProjectId ||
    !project.externalProviderCredentialId
  ) {
    return {
      glossaryTerms: [],
      translationMemoryMatches: [],
    };
  }

  const jobUid = input.externalJobUid?.trim();
  if (!jobUid) {
    return {
      glossaryTerms: [],
      translationMemoryMatches: [],
    };
  }

  const tmsProjectUid = resolvePhraseTmsProjectUid(project, project.externalProjectId);
  if (!tmsProjectUid) {
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
        eq(schema.organizationExternalTmsProviderCredentials.providerKind, "phrase"),
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

  const client = new PhraseTmsApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl,
  });

  const segment = input.sourceText.trim();
  if (!segment) {
    return {
      glossaryTerms: [],
      translationMemoryMatches: [],
    };
  }

  const attachedMemories = await db
    .select({
      id: schema.memories.id,
      externalMemoryId: schema.memories.externalMemoryId,
    })
    .from(schema.projectMemories)
    .innerJoin(schema.memories, eq(schema.projectMemories.memoryId, schema.memories.id))
    .where(eq(schema.projectMemories.projectId, project.id));

  const memoryIdByExternalUid = new Map(
    attachedMemories
      .filter((memory) => memory.externalMemoryId)
      .map((memory) => [memory.externalMemoryId as string, memory.id]),
  );

  const [tmSearchResults, termBaseSearchResults] = await Promise.all([
    client
      .searchJobTranslationMemorySegment({
        projectUid: tmsProjectUid,
        jobUid,
        segment,
      })
      .catch(() => []),
    client
      .searchJobTermBasesInText({
        projectUid: tmsProjectUid,
        jobUid,
        text: segment,
      })
      .catch(() => []),
  ]);

  const glossaryTerms = input.targetLocales.flatMap((targetLocale) =>
    normalizePhraseTermBaseSearchMatches(termBaseSearchResults, { targetLocale }),
  );

  const translationMemoryMatches = input.targetLocales.flatMap((targetLocale) =>
    normalizePhraseTranslationMemorySearchMatches(tmSearchResults, {
      targetLocale,
      memoryIdByExternalUid,
    }),
  );

  return {
    glossaryTerms: mergeTranslationContextMatches([], glossaryTerms, 20),
    translationMemoryMatches: mergeTranslationContextMatches([], translationMemoryMatches, 10),
  };
}
