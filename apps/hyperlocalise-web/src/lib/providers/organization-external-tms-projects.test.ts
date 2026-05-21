import "dotenv/config";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { createApiKey } from "@/lib/api-keys";

import {
  listOrganizationExternalTmsProjects,
  upsertOrganizationExternalTmsProject,
} from "./organization-external-tms-projects";
import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";

describe("organizationExternalTmsProjects", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    await db.delete(schema.projects).where(eq(schema.projects.source, "external_tms"));
    await db.delete(schema.organizationExternalTmsProviderCredentials);
    await db.delete(schema.organizationMemberships);
    await db.delete(schema.organizations);
    await db.delete(schema.users);
  });

  it("creates and updates a synced provider project without duplication", async () => {
    const userId = randomUUID();
    const organizationId = randomUUID();

    await db.insert(schema.users).values({ id: userId, workosUserId: `user_${randomUUID()}` });
    await db.insert(schema.organizations).values({
      id: organizationId,
      workosOrganizationId: `org_${randomUUID()}`,
      slug: `org-${randomUUID().slice(0, 8)}`,
      name: "Acme",
      apiKeyPrefix: createApiKey().id,
    });
    await db.insert(schema.organizationMemberships).values({
      organizationId,
      userId,
      role: "owner",
    });

    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "secret-token",
    });

    const created = await upsertOrganizationExternalTmsProject({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "phrase",
      externalProjectId: "ext-1",
      name: "Marketing Website",
      sourceLocale: "en-US",
      targetLocales: ["fr", "de"],
      externalProjectUrl: "https://example.test/projects/ext-1",
      metadata: { raw: { id: "ext-1" } },
    });

    expect(created.name).toBe("Marketing Website");

    const updated = await upsertOrganizationExternalTmsProject({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "phrase",
      externalProjectId: "ext-1",
      name: "Marketing Website v2",
      sourceLocale: "en-US",
      targetLocales: ["fr", "de", "es"],
      isActive: false,
      syncErrorMessage: "provider unavailable",
      metadata: { raw: { id: "ext-1", rev: 2 } },
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Marketing Website v2");
    expect(updated.isActive).toBe(false);
    expect(updated.lastSyncErrorMessage).toBe("provider unavailable");
    expect(updated.targetLocales).toEqual(["fr", "de", "es"]);

    const rows = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          eq(schema.projects.externalProviderKind, "phrase"),
          eq(schema.projects.externalProjectId, "ext-1"),
        ),
      );

    expect(rows).toHaveLength(1);
  });

  it("lists organization scoped provider projects", async () => {
    const userId = randomUUID();
    const organizationId = randomUUID();

    await db.insert(schema.users).values({ id: userId, workosUserId: `user_${randomUUID()}` });
    await db.insert(schema.organizations).values({
      id: organizationId,
      workosOrganizationId: `org_${randomUUID()}`,
      slug: `org-${randomUUID().slice(0, 8)}`,
      name: "Acme",
      apiKeyPrefix: createApiKey().id,
    });
    await db.insert(schema.organizationMemberships).values({
      organizationId,
      userId,
      role: "owner",
    });

    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "secret-token",
    });

    await upsertOrganizationExternalTmsProject({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      externalProjectId: "ext-1",
      name: "Docs",
      targetLocales: ["ja"],
    });

    const projects = await listOrganizationExternalTmsProjects({ organizationId });
    expect(projects).toHaveLength(1);
    expect(projects[0]?.externalProjectId).toBe("ext-1");
  });
});
