import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import {
  encryptProviderCredential,
  unwrapProviderCredentialCrypto,
} from "@/lib/security/provider-credential-crypto";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  ensureOrganizationProjectRecord,
  unwrapOrganizationProjectRecord,
} from "./organization-project-service";

const { getTmsProviderLiveProjectMock } = vi.hoisted(() => ({
  getTmsProviderLiveProjectMock: vi.fn(),
}));

vi.mock("@/lib/providers/jobs/tms-provider-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/jobs/tms-provider-live")>();
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

    expect(isOk(resolved)).toBe(true);
    if (isOk(resolved)) {
      expect(resolved.value).toBe(nativeProjectId);
    }
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
    });

    const resolved = await ensureOrganizationProjectRecord({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      userId: scope.userId,
    });

    expect(isOk(resolved)).toBe(true);
    if (isOk(resolved)) {
      expect(resolved.value).toBe(scope.projectId);
    }
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

  it("rejects cross-organization external project id collisions", async () => {
    const firstOrg = await seedExternalTmsOrganization();
    const secondOrg = await seedExternalTmsOrganization();

    getTmsProviderLiveProjectMock.mockResolvedValue({
      id: firstOrg.projectId,
      name: "Help Center",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      externalProjectUrl: "https://crowdin.com/project/help-center",
      isActive: true,
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: firstOrg.externalProjectId,
      description: null,
      translationContext: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.insert(schema.projects).values({
      id: firstOrg.projectId,
      organizationId: firstOrg.organizationId,
      createdByUserId: firstOrg.userId,
      name: "Org A Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProviderCredentialId: firstOrg.credentialId,
      externalProjectId: firstOrg.externalProjectId,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    });

    const result = await ensureOrganizationProjectRecord({
      organizationId: secondOrg.organizationId,
      projectId: firstOrg.projectId,
      userId: secondOrg.userId,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "project_not_found",
        reason: "external_project_id_collision",
        organizationId: secondOrg.organizationId,
        projectId: firstOrg.projectId,
      });
    }

    const [orgAProject] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, firstOrg.projectId))
      .limit(1);

    expect(orgAProject?.externalProviderCredentialId).toBe(firstOrg.credentialId);
  });

  it("rejects unknown native project ids", async () => {
    const scope = await seedExternalTmsOrganization();

    const result = await ensureOrganizationProjectRecord({
      organizationId: scope.organizationId,
      projectId: "missing-project",
      userId: scope.userId,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "project_not_found",
        reason: "native_project_missing",
        organizationId: scope.organizationId,
        projectId: "missing-project",
      });
    }
  });

  it("preserves structured error context when unwrapping failures", async () => {
    const scope = await seedExternalTmsOrganization();

    const result = await ensureOrganizationProjectRecord({
      organizationId: scope.organizationId,
      projectId: "missing-project",
      userId: scope.userId,
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      return;
    }

    try {
      unwrapOrganizationProjectRecord(result);
      expect.fail("expected unwrapOrganizationProjectRecord to throw");
    } catch (error) {
      expect(error).toMatchObject({
        message: "project_not_found",
        reason: "native_project_missing",
        organizationId: scope.organizationId,
        projectId: "missing-project",
      });
    }
  });
});
