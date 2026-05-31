import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import {
  listOrganizationExternalTmsMemories,
  upsertOrganizationExternalTmsMemory,
  upsertOrganizationExternalTmsMemoryEntry,
} from "./organization-external-tms-memories";
import { upsertOrganizationExternalTmsProviderCredential } from "../organization-external-tms-provider-credentials";

describe("organizationExternalTmsMemories", () => {
  const createdRecordsByTest = new Map<
    string,
    { organizationIds: Set<string>; userIds: Set<string> }
  >();

  function currentTestKey() {
    return expect.getState().currentTestName ?? "__organization_external_tms_memories_default__";
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
        .delete(schema.memories)
        .where(inArray(schema.memories.organizationId, organizationIds));
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

  it("upserts provider translation memories and entries without duplication", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "smartling",
      displayName: "Smartling",
      secretMaterial: "smartling-token",
    });

    const created = await upsertOrganizationExternalTmsMemory({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "smartling",
      externalProjectId: "smartling-project-1",
      externalMemoryId: "tm-42",
      name: "Product TM",
      localeCoverage: ["en", "fr"],
      segmentCount: 1200,
      capabilityMode: "synced_import",
      externalUrl: "https://dashboard.smartling.com/tm/42",
      metadata: { providerId: 42 },
    });

    expect(created.source).toBe("external_tms");
    expect(created.syncState).toBe("synced");
    expect(created.capabilityMode).toBe("synced_import");
    expect(created.segmentCapabilities).toMatchObject({
      mode: "synced_import",
      import: true,
      search: true,
    });

    const updated = await upsertOrganizationExternalTmsMemory({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "smartling",
      externalProjectId: "smartling-project-1",
      externalMemoryId: "tm-42",
      name: "Product TM (updated)",
      localeCoverage: ["en", "fr", "de"],
      segmentCount: 1300,
      syncState: "stale",
      capabilityMode: "synced_import",
      metadata: { providerId: 42, revision: 2 },
    });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Product TM (updated)");
    expect(updated.segmentCount).toBe(1300);
    expect(updated.syncState).toBe("stale");

    const entry = await upsertOrganizationExternalTmsMemoryEntry({
      memoryId: created.id,
      externalKey: "segment-9",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Checkout",
      targetText: "Paiement",
    });

    const entryAgain = await upsertOrganizationExternalTmsMemoryEntry({
      memoryId: created.id,
      externalKey: "segment-9",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Checkout",
      targetText: "Passer au paiement",
    });

    expect(entryAgain.id).toBe(entry.id);
    expect(entryAgain.targetText).toBe("Passer au paiement");

    const rows = await db
      .select()
      .from(schema.memoryEntries)
      .where(eq(schema.memoryEntries.memoryId, created.id));
    expect(rows).toHaveLength(1);

    const listed = await listOrganizationExternalTmsMemories({
      organizationId,
      providerKind: "smartling",
      externalProjectId: "smartling-project-1",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
  });

  it.each([
    ["live_search", { search: true, import: false, referenceOnly: false }],
    ["synced_import", { search: true, import: true, referenceOnly: false }],
    ["reference_only", { search: false, import: false, referenceOnly: true }],
  ] as const)(
    "persists %s capability mode on external translation memories",
    async (capabilityMode, expected) => {
      const { organizationId, userId } = await createOrganizationUser();
      const credential = await upsertOrganizationExternalTmsProviderCredential({
        organizationId,
        userId,
        role: "admin",
        providerKind: "phrase",
        displayName: "Phrase",
        secretMaterial: "phrase-token",
      });

      const memory = await upsertOrganizationExternalTmsMemory({
        organizationId,
        providerCredentialId: credential.id,
        providerKind: "phrase",
        externalProjectId: "phrase-project-1",
        externalMemoryId: `tm-${capabilityMode}`,
        name: `Phrase TM ${capabilityMode}`,
        capabilityMode,
      });

      expect(memory.capabilityMode).toBe(capabilityMode);
      expect(memory.segmentCapabilities).toMatchObject({
        mode: capabilityMode,
        ...expected,
      });
    },
  );
});
