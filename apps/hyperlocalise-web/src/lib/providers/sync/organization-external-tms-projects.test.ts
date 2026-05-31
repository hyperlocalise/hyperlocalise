import "dotenv/config";

import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import {
  listOrganizationExternalTmsProjects,
  upsertOrganizationExternalTmsProject,
} from "./organization-external-tms-projects";
import { upsertOrganizationExternalTmsProviderCredential } from "../organization-external-tms-provider-credentials";

describe("organizationExternalTmsProjects", () => {
  const createdRecordsByTest = new Map<
    string,
    { organizationIds: Set<string>; userIds: Set<string> }
  >();

  function currentTestKey() {
    return expect.getState().currentTestName ?? "__organization_external_tms_projects_default__";
  }

  function currentTestRecords() {
    const testKey = currentTestKey();
    const existing = createdRecordsByTest.get(testKey);

    if (existing) {
      return existing;
    }

    const records = {
      organizationIds: new Set<string>(),
      userIds: new Set<string>(),
    };
    createdRecordsByTest.set(testKey, records);

    return records;
  }

  async function createOrganizationUser() {
    const userId = randomUUID();
    const organizationId = randomUUID();
    const records = currentTestRecords();

    records.userIds.add(userId);
    records.organizationIds.add(organizationId);

    await db.insert(schema.users).values({
      id: userId,
      workosUserId: `user_${randomUUID()}`,
      email: `test-${userId}@example.com`,
    });
    await db.insert(schema.organizations).values({
      id: organizationId,
      workosOrganizationId: `org_${randomUUID()}`,
      slug: `org-${randomUUID().slice(0, 8)}`,
      name: "Acme",
    });
    await db.insert(schema.organizationMemberships).values({
      organizationId,
      userId,
      role: "admin",
    });

    return { organizationId, userId };
  }

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    const testKey = currentTestKey();
    const records = createdRecordsByTest.get(testKey);

    if (!records) {
      return;
    }

    const organizationIds = [...records.organizationIds];
    const userIds = [...records.userIds];

    if (organizationIds.length > 0) {
      await db
        .delete(schema.projects)
        .where(inArray(schema.projects.organizationId, organizationIds));
      await db
        .delete(schema.organizationExternalTmsProviderCredentials)
        .where(
          inArray(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            organizationIds,
          ),
        );
      await db
        .delete(schema.organizationMemberships)
        .where(inArray(schema.organizationMemberships.organizationId, organizationIds));
      await db
        .delete(schema.organizations)
        .where(inArray(schema.organizations.id, organizationIds));
    }

    if (userIds.length > 0) {
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }

    createdRecordsByTest.delete(testKey);
  });

  it("creates and updates a synced provider project without duplication", async () => {
    const { organizationId, userId } = await createOrganizationUser();

    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
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
    const { organizationId, userId } = await createOrganizationUser();

    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
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
