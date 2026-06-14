import "dotenv/config";

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import {
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import { loadOrganizationTranslationGenerator } from "./load-organization-translation-generator";
import * as stringJobExecutor from "./string-job-executor";

const projectFixture = createProjectTestFixture();

async function insertProviderCredential(input: {
  organizationId: string;
  userId: string;
  provider: "openai" | "anthropic" | "gemini" | "groq" | "mistral";
  defaultModel: string;
}) {
  const encrypted = unwrapProviderCredentialCrypto(
    encryptProviderCredential("test-provider-api-key"),
  );

  await db.insert(schema.organizationLlmProviderCredentials).values({
    organizationId: input.organizationId,
    createdByUserId: input.userId,
    updatedByUserId: input.userId,
    provider: input.provider,
    defaultModel: input.defaultModel,
    maskedApiKeySuffix: "••••-key",
    encryptionAlgorithm: encrypted.algorithm,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
    lastValidatedAt: new Date(),
  });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
  vi.restoreAllMocks();
});

describe("loadOrganizationTranslationGenerator", () => {
  it("returns the organization BYOK provider when configured", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();
    await insertProviderCredential({
      organizationId: organization.id,
      userId: user.id,
      provider: "gemini",
      defaultModel: "gemini-2.5-flash",
    });

    const result = await loadOrganizationTranslationGenerator(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.project.name).toBe(project.name);
    expect(typeof result.translateStringJob).toBe("function");
  });

  it("falls back to the managed translation model when no BYOK credential exists", async () => {
    const { project } = await projectFixture.createStoredProjectFixture();

    const result = await loadOrganizationTranslationGenerator(project.id);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(typeof result.translateStringJob).toBe("function");
  });

  it("fails when neither BYOK nor managed translation is available", async () => {
    vi.spyOn(stringJobExecutor, "isManagedTranslationModelAvailable").mockReturnValue(false);
    const { project } = await projectFixture.createStoredProjectFixture();

    const result = await loadOrganizationTranslationGenerator(project.id);

    expect(result).toEqual({
      ok: false,
      code: "provider_credential_missing",
      message: "no organization provider credential or managed translation model is configured",
    });
  });

  it("fails when the project does not exist", async () => {
    const result = await loadOrganizationTranslationGenerator(`proj_${randomUUID()}`);

    expect(result).toEqual({
      ok: false,
      code: "translation_project_not_found",
      message: expect.stringContaining("was not found"),
    });
  });
});
