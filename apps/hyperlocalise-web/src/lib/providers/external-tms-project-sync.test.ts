import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import {
  syncExternalTmsProjects,
  type ExternalTmsProjectFetcher,
} from "./external-tms-project-sync";
import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";

describe("syncExternalTmsProjects", () => {
  const createdRecordsByTest = new Map<
    string,
    { organizationIds: Set<string>; userIds: Set<string> }
  >();

  function currentTestKey() {
    return expect.getState().currentTestName ?? "__external_tms_project_sync_default__";
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
      role: "owner",
    });

    return { organizationId, userId };
  }

  async function createCredential(input?: { providerKind?: "phrase" | "crowdin" }) {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: input?.providerKind ?? "phrase",
      displayName: "Phrase",
      secretMaterial: "secret-token",
      baseUrl: "https://api.example.test",
    });

    return { organizationId, userId, credential };
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
        .delete(schema.providerSyncRuns)
        .where(inArray(schema.providerSyncRuns.organizationId, organizationIds));
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

  it("fetches provider projects and upserts them idempotently", async () => {
    const { organizationId, credential } = await createCredential();
    const fetchProjects: ExternalTmsProjectFetcher = async ({ credential: fetchedCredential }) => {
      expect(fetchedCredential.id).toBe(credential.id);
      return [
        {
          externalProjectId: "phrase-project-1",
          name: "Marketing Website",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR", "de-DE"],
          externalProjectUrl: "https://phrase.example.test/projects/phrase-project-1",
          metadata: { providerUpdatedAt: "2026-05-22T00:00:00Z" },
        },
      ];
    };

    const first = await syncExternalTmsProjects({
      organizationId,
      providerKind: "phrase",
      fetchProjects,
    });
    const second = await syncExternalTmsProjects({
      organizationId,
      providerKind: "phrase",
      fetchProjects,
    });

    expect(first.status).toBe("succeeded");
    expect(second.counts).toEqual({
      projectsDiscovered: 1,
      projectsSynced: 1,
      projectsFailed: 0,
      localesSynced: 3,
    });

    const projects = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId));
    expect(projects).toHaveLength(1);
    expect(projects[0]?.externalProviderCredentialId).toBe(credential.id);
    expect(projects[0]?.targetLocales).toEqual(["fr-FR", "de-DE"]);

    const runs = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(eq(schema.providerSyncRuns.organizationId, organizationId));
    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.status === "succeeded")).toBe(true);
  });

  it("keeps valid projects when one fetched project fails to persist", async () => {
    const { organizationId } = await createCredential({ providerKind: "crowdin" });

    const result = await syncExternalTmsProjects({
      organizationId,
      providerKind: "crowdin",
      fetchProjects: async () => [
        {
          externalProjectId: "crowdin-project-1",
          name: "Docs",
          sourceLocale: "en",
          targetLocales: ["ja"],
        },
        {
          externalProjectId: "crowdin-project-2",
          name: null,
          targetLocales: ["fr"],
        } as never,
      ],
    });

    expect(result.status).toBe("failed");
    expect(result.counts).toEqual({
      projectsDiscovered: 2,
      projectsSynced: 1,
      projectsFailed: 1,
      localesSynced: 2,
    });
    expect(result.failures[0]?.externalProjectId).toBe("crowdin-project-2");

    const projects = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId));
    expect(projects).toHaveLength(1);
    expect(projects[0]?.externalProjectId).toBe("crowdin-project-1");

    const [run] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(eq(schema.providerSyncRuns.organizationId, organizationId));
    expect(run?.status).toBe("failed");
    expect(run?.counts).toEqual(result.counts);
    expect(run?.errorMessage).toBe("One or more provider projects failed to sync");
  });

  it("records a failed run when provider project fetching fails", async () => {
    const { organizationId } = await createCredential();

    await expect(
      syncExternalTmsProjects({
        organizationId,
        providerKind: "phrase",
        fetchProjects: async () => {
          throw new Error("Phrase returned HTTP 429 while listing projects");
        },
      }),
    ).rejects.toThrow("Phrase returned HTTP 429 while listing projects");

    const [run] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(eq(schema.providerSyncRuns.organizationId, organizationId));
    expect(run?.status).toBe("failed");
    expect(run?.errorMessage).toBe("Phrase returned HTTP 429 while listing projects");
  });

  it("requires a connected provider credential", async () => {
    await expect(
      syncExternalTmsProjects({
        organizationId: randomUUID(),
        providerKind: "phrase",
        fetchProjects: async () => [],
      }),
    ).rejects.toThrow("provider_credential_not_found");
  });
});
