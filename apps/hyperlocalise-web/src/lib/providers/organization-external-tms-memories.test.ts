import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import {
  pruneOrganizationExternalTmsMemoryEntries,
  upsertOrganizationExternalTmsMemory,
  upsertOrganizationExternalTmsMemoryEntry,
} from "./organization-external-tms-memories";
import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";

describe("organizationExternalTmsMemories", () => {
  const organizationIds = new Set<string>();
  const userIds = new Set<string>();

  async function createOrganizationUser() {
    const userId = randomUUID();
    const organizationId = randomUUID();

    userIds.add(userId);
    organizationIds.add(organizationId);

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
      role: "owner",
    });

    return { organizationId, userId };
  }

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    const createdOrganizationIds = [...organizationIds];
    const createdUserIds = [...userIds];

    if (createdOrganizationIds.length > 0) {
      await db
        .delete(schema.memories)
        .where(inArray(schema.memories.organizationId, createdOrganizationIds));
      await db
        .delete(schema.organizationExternalTmsProviderCredentials)
        .where(
          inArray(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            createdOrganizationIds,
          ),
        );
      await db
        .delete(schema.organizationMemberships)
        .where(inArray(schema.organizationMemberships.organizationId, createdOrganizationIds));
      await db
        .delete(schema.organizations)
        .where(inArray(schema.organizations.id, createdOrganizationIds));
    }

    if (createdUserIds.length > 0) {
      await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
    }

    organizationIds.clear();
    userIds.clear();
  });

  it("prunes stale provider memory entries after re-sync", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-token",
    });
    const memory = await upsertOrganizationExternalTmsMemory({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      externalMemoryId: "tm-77",
      name: "Product TM",
      sourceLocale: "en",
    });

    await upsertOrganizationExternalTmsMemoryEntry({
      memoryId: memory.id,
      externalKey: "tm-77:1:fr",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Checkout",
      targetText: "Paiement",
    });
    await upsertOrganizationExternalTmsMemoryEntry({
      memoryId: memory.id,
      externalKey: "tm-77:2:fr",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceText: "Sign in",
      targetText: "Connexion",
    });

    await pruneOrganizationExternalTmsMemoryEntries({
      memoryId: memory.id,
      externalKeys: ["tm-77:1:fr"],
    });

    const remaining = await db
      .select({ externalKey: schema.memoryEntries.externalKey })
      .from(schema.memoryEntries)
      .where(eq(schema.memoryEntries.memoryId, memory.id));
    expect(remaining).toEqual([{ externalKey: "tm-77:1:fr" }]);

    await pruneOrganizationExternalTmsMemoryEntries({
      memoryId: memory.id,
      externalKeys: [],
    });

    const emptied = await db
      .select()
      .from(schema.memoryEntries)
      .where(eq(schema.memoryEntries.memoryId, memory.id));
    expect(emptied).toHaveLength(0);
  });
});
