import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { createOpenAIStringTranslationGenerator } from "@/lib/translation/string-job-executor";

export async function loadOrganizationOpenAITranslationGenerator(projectId: string) {
  const [project] = await db
    .select({
      name: schema.projects.name,
      translationContext: schema.projects.translationContext,
      organizationId: schema.projects.organizationId,
      provider: schema.organizationLlmProviderCredentials.provider,
      defaultModel: schema.organizationLlmProviderCredentials.defaultModel,
      encryptionAlgorithm: schema.organizationLlmProviderCredentials.encryptionAlgorithm,
      ciphertext: schema.organizationLlmProviderCredentials.ciphertext,
      iv: schema.organizationLlmProviderCredentials.iv,
      authTag: schema.organizationLlmProviderCredentials.authTag,
      keyVersion: schema.organizationLlmProviderCredentials.keyVersion,
    })
    .from(schema.projects)
    .leftJoin(
      schema.organizationLlmProviderCredentials,
      and(
        eq(
          schema.organizationLlmProviderCredentials.organizationId,
          schema.projects.organizationId,
        ),
        eq(schema.organizationLlmProviderCredentials.provider, "openai"),
      ),
    )
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project) {
    return {
      ok: false,
      code: "translation_project_not_found",
      message: `translation project ${projectId} was not found`,
    } as const;
  }

  if (!project.provider) {
    const [anyCredential] = await db
      .select({
        provider: schema.organizationLlmProviderCredentials.provider,
      })
      .from(schema.organizationLlmProviderCredentials)
      .where(eq(schema.organizationLlmProviderCredentials.organizationId, project.organizationId))
      .limit(1);

    if (anyCredential) {
      return {
        ok: false,
        code: "unsupported_provider",
        message: `translation jobs support OpenAI provider credentials only, got ${anyCredential.provider}`,
      } as const;
    }

    return {
      ok: false,
      code: "provider_credential_missing",
      message: "organization OpenAI provider credential is not configured",
    } as const;
  }

  if (project.provider !== "openai") {
    return {
      ok: false,
      code: "unsupported_provider",
      message: `translation jobs support OpenAI provider credentials only, got ${project.provider}`,
    } as const;
  }

  if (
    !project.defaultModel ||
    !project.encryptionAlgorithm ||
    !project.ciphertext ||
    !project.iv ||
    !project.authTag ||
    project.keyVersion === null
  ) {
    return {
      ok: false,
      code: "provider_credential_invalid",
      message: "organization OpenAI provider credential is incomplete",
    } as const;
  }

  const apiKey = unwrapProviderCredentialCrypto(
    decryptProviderCredential({
      algorithm: project.encryptionAlgorithm,
      keyVersion: project.keyVersion,
      ciphertext: project.ciphertext,
      iv: project.iv,
      authTag: project.authTag,
    }),
  );

  return {
    ok: true,
    project: {
      name: project.name,
      translationContext: project.translationContext,
    },
    translateStringJob: createOpenAIStringTranslationGenerator({
      apiKey,
      model: project.defaultModel,
    }),
  } as const;
}
