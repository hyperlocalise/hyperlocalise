import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { TranslationContextProjectRecord } from "@/lib/translation/assemble-translation-context";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";

import { resolvePhraseTmsProjectUid } from "./phrase-job-context";
import {
  mergeTranslationContextMatches,
  normalizePhraseTermBaseSearchMatches,
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
    return { glossaryTerms: [] };
  }

  const jobUid = input.externalJobUid?.trim();
  if (!jobUid) {
    return { glossaryTerms: [] };
  }

  const tmsProjectUid = resolvePhraseTmsProjectUid(project, project.externalProjectId);
  if (!tmsProjectUid) {
    return { glossaryTerms: [] };
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
    return { glossaryTerms: [] };
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
    return { glossaryTerms: [] };
  }

  const termBaseSearchResults = await client
    .searchJobTermBasesInText({
      projectUid: tmsProjectUid,
      jobUid,
      text: segment,
    })
    .catch(() => []);

  const glossaryTerms = input.targetLocales.flatMap((targetLocale) =>
    normalizePhraseTermBaseSearchMatches(termBaseSearchResults, { targetLocale }),
  );

  return {
    glossaryTerms: mergeTranslationContextMatches([], glossaryTerms, 20),
  };
}
