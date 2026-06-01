import "dotenv/config";

import { randomUUID } from "node:crypto";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { upsertOrganizationExternalTmsMemory } from "@/lib/providers/sync/organization-external-tms-memories";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/organization-external-tms-provider-credentials";

import { createMemoryTestFixture } from "./memory.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

function generateNonExistentUuid(): string {
  return randomUUID();
}

const client = testClient(app);
const memoryFixture = createMemoryTestFixture(client);
const { authHeadersFor, createMemoryViaApi, createWorkosIdentity, createWorkosIdentityWithRole } =
  memoryFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await memoryFixture.cleanup();
});

describe("memoryRoutes", () => {
  it("returns 401 when auth context is missing", async () => {
    const response = await client.api.orgs[":organizationSlug"]["translation-memories"].$get({
      param: { organizationSlug: "missing-slug" },
      query: { limit: "50", offset: "0" },
    });

    expect(response.status).toBe(401);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "unauthorized", message: expect.any(String) });
  });

  it("keeps memory routes mounted at the org-scoped app path", async () => {
    const identity = createWorkosIdentity();
    await createMemoryViaApi(identity, { name: "Mounted TM" });
    const headers = await authHeadersFor(identity);

    const orgScopedResponse = await client.api.orgs[":organizationSlug"][
      "translation-memories"
    ].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { limit: "50", offset: "0" },
      },
      { headers },
    );

    expect(orgScopedResponse.status).toBe(200);
    await expect(orgScopedResponse.json()).resolves.toMatchObject({
      memories: [expect.objectContaining({ name: "Mounted TM" })],
      total: 1,
    });
  });

  it("lists native and provider-backed translation memories together", async () => {
    const identity = createWorkosIdentity();
    const { organization, user } = await memoryFixture.createLocalWorkosIdentity(identity);
    await createMemoryViaApi(identity, { name: "Native TM" });

    const organizationId = organization.id;
    const userId = user.id;
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-token",
    });

    await upsertOrganizationExternalTmsMemory({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      externalMemoryId: "tm-77",
      name: "Crowdin TM",
      localeCoverage: ["en", "fr"],
      capabilityMode: "live_search",
      externalUrl: "https://crowdin.com/tm/77",
    });

    const response = await client.api.orgs[":organizationSlug"]["translation-memories"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { limit: "50", offset: "0" },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));

    expect(body.memories).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.memories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Native TM", source: "native" }),
        expect.objectContaining({
          name: "Crowdin TM",
          source: "external_tms",
          externalProviderKind: "crowdin",
          externalMemoryId: "tm-77",
          capabilityMode: "live_search",
          externalUrl: "https://crowdin.com/tm/77",
        }),
      ]),
    );
  });

  it("creates a native translation memory with validated input", async () => {
    const identity = createWorkosIdentity();
    const response = await createMemoryViaApi(identity, {
      name: "Marketing TM",
      description: "Marketing translation memory",
    });

    expect(response.status).toBe(201);

    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));

    expect(body.memory).toMatchObject({
      name: "Marketing TM",
      description: "Marketing translation memory",
      source: "native",
      externalProviderKind: null,
      capabilityMode: null,
    });
  });

  it("returns memory_not_found for unknown ids", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: generateNonExistentUuid(),
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "memory_not_found" });
  });

  it("forbids mutating provider-backed translation memories", async () => {
    const identity = createWorkosIdentity();
    const { organization, user } = await memoryFixture.createLocalWorkosIdentity(identity);
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId: organization.id,
      userId: user.id,
      role: "admin",
      providerKind: "lokalise",
      displayName: "Lokalise",
      secretMaterial: "lokalise-token",
    });

    const externalMemory = await upsertOrganizationExternalTmsMemory({
      organizationId: organization.id,
      providerCredentialId: credential.id,
      providerKind: "lokalise",
      externalProjectId: "lokalise-project-1",
      externalMemoryId: "job-tm-ref",
      name: "Job-linked TM",
      capabilityMode: "reference_only",
    });

    const headers = await authHeadersFor(identity);

    const patchResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: externalMemory.id,
        },
        json: { name: "Renamed" },
      },
      { headers },
    );
    expect(patchResponse.status).toBe(403);
    await expect(patchResponse.json()).resolves.toMatchObject({
      error: "external_tms_memory_immutable",
    });

    const deleteResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].$delete(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: externalMemory.id,
        },
      },
      { headers },
    );
    expect(deleteResponse.status).toBe(403);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      error: "external_tms_memory_immutable",
    });
  });

  it("forbids members from creating translation memories", async () => {
    const identity = createWorkosIdentityWithRole("member");
    const response = await createMemoryViaApi(identity, { name: "Member TM" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "forbidden" });
  });

  it("manages native memory entries and project assignment", async () => {
    const { identity, organization, user, memory } =
      await memoryFixture.createStoredMemoryFixture();
    const headers = await authHeadersFor(identity);

    const createEntryResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          sourceLocale: "en",
          targetLocale: "fr",
          sourceText: "Start free trial",
          targetText: "Commencer l'essai gratuit",
          matchScore: 100,
        },
      },
      { headers },
    );
    expect(createEntryResponse.status).toBe(201);
    const createEntryBody = await createEntryResponse.json();
    if ("error" in createEntryBody) throw new Error(String(createEntryBody.error));
    expect(createEntryBody.memoryEntry).toMatchObject({
      sourceText: "Start free trial",
      targetText: "Commencer l'essai gratuit",
    });

    const updateEntryResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries[":entryId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
          entryId: createEntryBody.memoryEntry.id,
        },
        json: { targetText: "Démarrer l'essai gratuit" },
      },
      { headers },
    );
    expect(updateEntryResponse.status).toBe(200);
    await expect(updateEntryResponse.json()).resolves.toMatchObject({
      memoryEntry: expect.objectContaining({ targetText: "Démarrer l'essai gratuit" }),
    });

    const importResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].entries["import"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: {
          format: "csv",
          content: "sourceLocale,targetLocale,sourceText,targetText\nen,fr,Hello,Bonjour",
        },
      },
      { headers },
    );
    expect(importResponse.status).toBe(201);
    await expect(importResponse.json()).resolves.toMatchObject({ imported: 1 });

    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        createdByUserId: user.id,
        name: "Website",
        sourceLocale: "en",
        targetLocales: ["fr"],
      })
      .returning();

    const attachResponse = await client.api.orgs[":organizationSlug"]["translation-memories"][
      ":memoryId"
    ].projects.$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          memoryId: memory.id,
        },
        json: { projectId: project.id, priority: 0 },
      },
      { headers },
    );
    expect(attachResponse.status).toBe(200);
    await expect(attachResponse.json()).resolves.toMatchObject({
      projects: [expect.objectContaining({ projectId: project.id, projectName: "Website" })],
    });
  });
});
