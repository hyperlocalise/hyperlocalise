import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  decryptProviderCredential,
  encryptProviderCredential,
  maskProviderCredentialSuffix,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { db, schema } from "@/lib/database";
import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

import { createContentfulConnection, updateContentfulConnection } from "./connections";

const { getTmsProviderLiveProjectMock } = vi.hoisted(() => ({
  getTmsProviderLiveProjectMock: vi.fn(),
}));

vi.mock("@/lib/providers/tms-provider-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/tms-provider-live")>();
  return {
    ...actual,
    getTmsProviderLiveProject: (...args: unknown[]) => getTmsProviderLiveProjectMock(...args),
  };
});

const organizationIds: string[] = [];

async function seedContentfulConnectionScope() {
  const organizationId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const projectId = `project-${organizationId.slice(0, 8)}`;

  organizationIds.push(organizationId);

  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `contentful-connection-${organizationId.slice(0, 8)}`,
    name: "Contentful Connection Test Org",
  });

  await db.insert(schema.users).values({
    id: userId,
    workosUserId: `user_${userId}`,
    email: `${userId}@example.test`,
  });

  await db.insert(schema.projects).values({
    id: projectId,
    organizationId,
    createdByUserId: userId,
    name: "Website",
  });

  return { organizationId, userId, projectId };
}

describe("contentful connection credential handling", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
  });

  it("encrypts Contentful Management API tokens before persistence", () => {
    const token = "cma_test_plaintext_token";
    const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential(token));

    expect(encrypted.ciphertext).not.toContain(token);
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();
    expect(maskProviderCredentialSuffix(token)).toBe("••••oken");

    const decrypted = unwrapProviderCredentialCrypto(decryptProviderCredential(encrypted));
    expect(decrypted).toBe(token);
  });

  it("resets validation only when Contentful security-sensitive fields change", async () => {
    const scope = await seedContentfulConnectionScope();
    const created = await createContentfulConnection({
      organizationId: scope.organizationId,
      userId: scope.userId,
      projectId: scope.projectId,
      displayName: "Contentful Help Center",
      spaceId: `space-${scope.organizationId.slice(0, 8)}`,
      environmentId: "master",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      contentTypeIds: ["helpCenterArticle"],
      fieldConfig: { fieldMode: "auto" },
      accessToken: "cma_test_token",
    });
    const validatedAt = new Date("2026-06-01T00:00:00.000Z");

    await db
      .update(schema.contentfulConnections)
      .set({
        validationStatus: "succeeded",
        validationMessage: "Connected",
        lastValidatedAt: validatedAt,
      })
      .where(eq(schema.contentfulConnections.id, created.connection.id));

    const displayNameOnly = await updateContentfulConnection({
      organizationId: scope.organizationId,
      userId: scope.userId,
      connectionId: created.connection.id,
      displayName: "Contentful Docs",
    });

    expect(displayNameOnly?.connection.validationStatus).toBe("succeeded");
    expect(displayNameOnly?.connection.validationMessage).toBe("Connected");
    expect(displayNameOnly?.connection.lastValidatedAt).toBe(validatedAt.toISOString());

    const changedSpace = await updateContentfulConnection({
      organizationId: scope.organizationId,
      userId: scope.userId,
      connectionId: created.connection.id,
      spaceId: `space-updated-${scope.organizationId.slice(0, 8)}`,
      environmentId: "preview",
    });

    expect(changedSpace?.connection.validationStatus).toBe("unvalidated");
    expect(changedSpace?.connection.validationMessage).toBeNull();
    expect(changedSpace?.connection.lastValidatedAt).toBeNull();
  });

  it("creates a connection for an external TMS project id", async () => {
    const scope = await seedContentfulConnectionScope();
    const externalProjectId = "902807";
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId,
    });

    const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential("crowdin-token"));
    await db.insert(schema.organizationExternalTmsProviderCredentials).values({
      organizationId: scope.organizationId,
      providerKind: "crowdin",
      displayName: "Crowdin",
      authMode: "api_token",
      encryptionAlgorithm: encrypted.algorithm,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedSecretSuffix: "••••ken",
      validationStatus: "valid",
      createdByUserId: scope.userId,
      updatedByUserId: scope.userId,
    });

    getTmsProviderLiveProjectMock.mockResolvedValue({
      id: projectId,
      name: "Help Center",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      externalProjectUrl: null,
      isActive: true,
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId,
      description: null,
      translationContext: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      openJobCount: 0,
    });

    const created = await createContentfulConnection({
      organizationId: scope.organizationId,
      userId: scope.userId,
      projectId,
      displayName: "Contentful Help Center",
      spaceId: `space-${scope.organizationId.slice(0, 8)}`,
      environmentId: "master",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      contentTypeIds: ["helpCenterArticle"],
      fieldConfig: { fieldMode: "auto" },
      accessToken: "cma_test_token",
    });

    expect(created.connection.projectId).toBe(projectId);

    const [project] = await db
      .select({ id: schema.projects.id, source: schema.projects.source })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);

    expect(project).toMatchObject({
      id: projectId,
      source: "external_tms",
    });
  });
});
