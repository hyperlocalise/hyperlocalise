import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import {
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { encodeProviderProjectId } from "@/lib/providers/tms-provider-resource-id";

import { ensureOrganizationProjectRecord } from "./ensure-organization-project";

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

async function seedExternalTmsOrganization() {
  const organizationId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const externalProjectId = "902807";
  const projectId = encodeProviderProjectId({
    providerKind: "crowdin",
    externalProjectId,
  });

  organizationIds.push(organizationId);

  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${organizationId}`,
    slug: `ensure-project-${organizationId.slice(0, 8)}`,
    name: "Ensure Project Test Org",
  });

  await db.insert(schema.users).values({
    id: userId,
    workosUserId: `user_${userId}`,
    email: `${userId}@example.test`,
  });

  const encrypted = unwrapProviderCredentialCrypto(encryptProviderCredential("crowdin-token"));

  const [credential] = await db
    .insert(schema.organizationExternalTmsProviderCredentials)
    .values({
      organizationId,
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
      createdByUserId: userId,
      updatedByUserId: userId,
    })
    .returning();

  return {
    organizationId,
    userId,
    projectId,
    externalProjectId,
    credentialId: credential!.id,
  };
}

describe("ensureOrganizationProjectRecord", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    for (const organizationId of organizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
  });

  it("returns an existing native project without calling the TMS provider", async () => {
    const scope = await seedExternalTmsOrganization();
    const nativeProjectId = `project-${scope.organizationId.slice(0, 8)}`;

    await db.insert(schema.projects).values({
      id: nativeProjectId,
      organizationId: scope.organizationId,
      createdByUserId: scope.userId,
      name: "Website",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    });

    const resolved = await ensureOrganizationProjectRecord({
      organizationId: scope.organizationId,
      projectId: nativeProjectId,
      userId: scope.userId,
    });

    expect(resolved).toBe(nativeProjectId);
    expect(getTmsProviderLiveProjectMock).not.toHaveBeenCalled();
  });

  it("materializes an external TMS project from the active provider", async () => {
    const scope = await seedExternalTmsOrganization();

    getTmsProviderLiveProjectMock.mockResolvedValue({
      id: scope.projectId,
      name: "Help Center",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
      externalProjectUrl: "https://crowdin.com/project/help-center",
      isActive: true,
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: scope.externalProjectId,
      description: null,
      translationContext: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      openJobCount: 0,
    });

    const resolved = await ensureOrganizationProjectRecord({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      userId: scope.userId,
    });

    expect(resolved).toBe(scope.projectId);
    expect(getTmsProviderLiveProjectMock).toHaveBeenCalledWith(
      scope.organizationId,
      scope.externalProjectId,
      { actorUserId: scope.userId },
    );

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, scope.projectId))
      .limit(1);

    expect(project).toMatchObject({
      organizationId: scope.organizationId,
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: scope.externalProjectId,
      externalProviderCredentialId: scope.credentialId,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
      isActive: true,
    });
  });

  it("rejects unknown native project ids", async () => {
    const scope = await seedExternalTmsOrganization();

    await expect(
      ensureOrganizationProjectRecord({
        organizationId: scope.organizationId,
        projectId: "missing-project",
        userId: scope.userId,
      }),
    ).rejects.toThrow("project_not_found");
  });
});
