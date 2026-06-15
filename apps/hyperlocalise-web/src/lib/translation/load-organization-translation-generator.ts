import type { LanguageModel } from "ai";
import { desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import {
  decryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import {
  createManagedStringTranslationGenerator,
  createProviderStringTranslationGenerator,
  getManagedTranslationLanguageModel,
  isManagedTranslationModelAvailable,
  resolveProviderLanguageModel,
} from "@/lib/translation/string-job-executor";

type OrganizationTranslationProject = {
  name: string;
  translationContext: string;
};

type OrganizationTranslationSetupResult =
  | {
      ok: false;
      code:
        | "translation_project_not_found"
        | "provider_credential_invalid"
        | "provider_credential_missing";
      message: string;
    }
  | {
      ok: true;
      project: OrganizationTranslationProject;
      model: LanguageModel;
      translateStringJob: ReturnType<typeof createProviderStringTranslationGenerator>;
    };

async function loadOrganizationTranslationSetup(
  projectId: string,
): Promise<OrganizationTranslationSetupResult> {
  const [project] = await db
    .select({
      name: schema.projects.name,
      translationContext: schema.projects.translationContext,
      organizationId: schema.projects.organizationId,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project) {
    return {
      ok: false,
      code: "translation_project_not_found",
      message: `translation project ${projectId} was not found`,
    } as const;
  }

  const [credential] = await db
    .select({
      provider: schema.organizationLlmProviderCredentials.provider,
      defaultModel: schema.organizationLlmProviderCredentials.defaultModel,
      encryptionAlgorithm: schema.organizationLlmProviderCredentials.encryptionAlgorithm,
      ciphertext: schema.organizationLlmProviderCredentials.ciphertext,
      iv: schema.organizationLlmProviderCredentials.iv,
      authTag: schema.organizationLlmProviderCredentials.authTag,
      keyVersion: schema.organizationLlmProviderCredentials.keyVersion,
    })
    .from(schema.organizationLlmProviderCredentials)
    .where(eq(schema.organizationLlmProviderCredentials.organizationId, project.organizationId))
    .orderBy(desc(schema.organizationLlmProviderCredentials.updatedAt))
    .limit(1);

  const projectContext = {
    name: project.name,
    translationContext: project.translationContext,
  };

  if (credential) {
    if (
      !credential.defaultModel ||
      !credential.encryptionAlgorithm ||
      !credential.ciphertext ||
      !credential.iv ||
      !credential.authTag ||
      credential.keyVersion === null
    ) {
      return {
        ok: false,
        code: "provider_credential_invalid",
        message: "organization provider credential is incomplete",
      } as const;
    }

    const apiKey = unwrapProviderCredentialCrypto(
      decryptProviderCredential({
        algorithm: credential.encryptionAlgorithm,
        keyVersion: credential.keyVersion,
        ciphertext: credential.ciphertext,
        iv: credential.iv,
        authTag: credential.authTag,
      }),
    );

    const model = resolveProviderLanguageModel({
      provider: credential.provider,
      apiKey,
      model: credential.defaultModel,
    });

    return {
      ok: true,
      project: projectContext,
      model,
      translateStringJob: createProviderStringTranslationGenerator({
        provider: credential.provider,
        apiKey,
        model: credential.defaultModel,
      }),
    } as const;
  }

  if (!isManagedTranslationModelAvailable()) {
    return {
      ok: false,
      code: "provider_credential_missing",
      message: "no organization provider credential or managed translation model is configured",
    } as const;
  }

  return {
    ok: true,
    project: projectContext,
    model: getManagedTranslationLanguageModel(),
    translateStringJob: createManagedStringTranslationGenerator(),
  } as const;
}

export async function loadOrganizationTranslationGenerator(projectId: string) {
  const setup = await loadOrganizationTranslationSetup(projectId);
  if (!setup.ok) {
    return setup;
  }

  return {
    ok: true as const,
    project: setup.project,
    translateStringJob: setup.translateStringJob,
  };
}

export async function loadOrganizationTranslationModel(projectId: string) {
  const setup = await loadOrganizationTranslationSetup(projectId);
  if (!setup.ok) {
    return setup;
  }

  return {
    ok: true as const,
    project: setup.project,
    model: setup.model,
  };
}

/** @deprecated Use `loadOrganizationTranslationGenerator` instead. */
export const loadOrganizationOpenAITranslationGenerator = loadOrganizationTranslationGenerator;
