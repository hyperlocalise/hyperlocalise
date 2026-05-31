import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app, createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { createRepositorySourceFileVersion, createStoredFile } from "@/lib/file-storage/records";
import { upsertExternalJob } from "@/lib/providers/sync/organization-external-tms-jobs";
import { upsertExternalTmsFile } from "@/lib/providers/sync/organization-external-tms-files";

import { createMemoryFileStorageAdapter } from "../file/file.fixture";
import { createProjectTestFixture } from "./project.fixture";
import type {
  ProjectFileDetailResponse,
  ProjectResponse,
  ProjectsResponse,
  ProjectFilesResponse,
} from "./project.schema";

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

const client = testClient(app);
const appClient = client;
const fileStorageAdapter = createMemoryFileStorageAdapter();
const fileDetailClient = testClient(createApp({ fileStorageAdapter }));
const projectFixture = createProjectTestFixture(client);
const { authHeadersFor, createProjectViaApi, createWorkosIdentity, createWorkosIdentityWithRole } =
  projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

describe("projectRoutes", () => {
  it("returns 401 when auth context is missing", async () => {
    const response = await client.api.orgs[":organizationSlug"].projects.$get({
      param: { organizationSlug: "missing-slug" },
    });

    expect(response.status).toBe(401);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "unauthorized", message: expect.any(String) });
  });

  it("keeps project routes mounted at the org-scoped app path", async () => {
    const identity = createWorkosIdentity();
    await createProjectViaApi(identity, { name: "Mounted Project" });
    const headers = await authHeadersFor(identity);

    const orgScopedResponse = await appClient.api.orgs[":organizationSlug"].projects.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
      },
      { headers },
    );

    expect(orgScopedResponse.status).toBe(200);
    await expect(orgScopedResponse.json()).resolves.toMatchObject({
      projects: [expect.objectContaining({ name: "Mounted Project" })],
    });
  });

  it("lists projects for the current organization", async () => {
    const identity = createWorkosIdentity();
    await createProjectViaApi(identity, { name: "Project One" });
    await createProjectViaApi(identity, { name: "Project Two" });

    const otherIdentity = createWorkosIdentity();
    await createProjectViaApi(otherIdentity, { name: "Other Org Project" });

    const response = await client.api.orgs[":organizationSlug"].projects.$get(
      { param: { organizationSlug: identity.organization.slug ?? "missing-slug" } },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as ProjectsResponse;
    expect(body.projects).toHaveLength(2);
    expect(body.projects.map((project) => project.name)).toEqual(["Project Two", "Project One"]);
  });

  it("creates a project with validated input", async () => {
    const identity = createWorkosIdentity();
    const response = await createProjectViaApi(identity, {
      name: "Docs",
      description: "Documentation content",
      translationContext: "Keep terminology consistent.",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
    });

    expect(response.status).toBe(201);

    const body = (await response.json()) as ProjectResponse;
    expect(body.project.id).toMatch(/^project_/);
    expect(body.project.name).toBe("Docs");
    expect(body.project.description).toBe("Documentation content");
    expect(body.project.translationContext).toBe("Keep terminology consistent.");
    expect(body.project.sourceLocale).toBe("en-US");
    expect(body.project.targetLocales).toEqual(["fr-FR", "de-DE"]);
  });

  it("returns 400 when create payload omits locales", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: "Docs",
        } as Parameters<
          (typeof client.api.orgs)[":organizationSlug"]["projects"]["$post"]
        >[0]["json"],
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when source locale appears in target locales", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: "Docs",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR", "en-us"],
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(400);
  });

  it("allows partial locale patch on legacy native projects", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();

    await db
      .update(schema.projects)
      .set({ sourceLocale: null, targetLocales: [] })
      .where(eq(schema.projects.id, project.id));

    const targetsOnlyResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: { targetLocales: ["fr-FR", "de-DE"] },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(targetsOnlyResponse.status).toBe(200);
    const targetsOnlyBody = (await targetsOnlyResponse.json()) as ProjectResponse;
    expect(targetsOnlyBody.project.sourceLocale).toBeNull();
    expect(targetsOnlyBody.project.targetLocales).toEqual(["fr-FR", "de-DE"]);

    await db
      .update(schema.projects)
      .set({ sourceLocale: null, targetLocales: [] })
      .where(eq(schema.projects.id, project.id));

    const sourceOnlyResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
        json: { sourceLocale: "en-GB" },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(sourceOnlyResponse.status).toBe(200);
    const sourceOnlyBody = (await sourceOnlyResponse.json()) as ProjectResponse;
    expect(sourceOnlyBody.project.sourceLocale).toBe("en-GB");
    expect(sourceOnlyBody.project.targetLocales).toEqual([]);
  });

  it("updates native project locales", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
        json: {
          sourceLocale: "en-GB",
          targetLocales: ["es-ES", "it-IT"],
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectResponse;
    expect(body.project.sourceLocale).toBe("en-GB");
    expect(body.project.targetLocales).toEqual(["es-ES", "it-IT"]);
  });

  it("returns 400 for invalid create payloads", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: "   ",
        } as Parameters<
          (typeof client.api.orgs)[":organizationSlug"]["projects"]["$post"]
        >[0]["json"],
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "invalid_project_payload",
      message: expect.any(String),
    });
  });

  it("returns 403 when a member creates a project", async () => {
    const identity = createWorkosIdentityWithRole("member");
    const response = await client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: "Docs",
          description: "Documentation content",
          translationContext: "Keep terminology consistent.",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(403);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "forbidden", message: expect.any(String) });
  });

  it("returns a project by id", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as ProjectResponse;
    expect(body.project.id).toBe(createdBody.project.id);
    expect(body.project.name).toBe("Marketing Site");
  });

  it("updates an existing project", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
        json: {
          name: "Docs v2",
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as ProjectResponse;
    expect(body.project.id).toBe(createdBody.project.id);
    expect(body.project.name).toBe("Docs v2");
  });

  it("returns 400 for invalid patch payloads", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const emptyResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
        json: {},
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(emptyResponse.status).toBe(400);
    const emptyResponseBody = await emptyResponse.json();
    expect(emptyResponseBody).toMatchObject({
      error: "invalid_project_payload",
      message: expect.any(String),
    });

    const invalidNameResponse = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].$patch(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
        json: {
          name: "   ",
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(invalidNameResponse.status).toBe(400);
    const invalidNameResponseBody = await invalidNameResponse.json();
    expect(invalidNameResponseBody).toMatchObject({
      error: "invalid_project_payload",
      message: expect.any(String),
    });
  });

  it("returns 404 when another organization fetches a project", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$get(
      {
        param: {
          organizationSlug: ownerIdentity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
      },
      {
        headers: await authHeadersFor(otherIdentity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "project_not_found", message: expect.any(String) });
  });

  it("returns 404 when another organization updates a project", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$patch(
      {
        param: {
          organizationSlug: ownerIdentity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
        json: {
          name: "Should Not Apply",
        },
      },
      {
        headers: await authHeadersFor(otherIdentity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "project_not_found", message: expect.any(String) });
  });

  it("returns 403 when a member updates a project", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const memberIdentity = createWorkosIdentityWithRole("member");
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$patch(
      {
        param: {
          organizationSlug: ownerIdentity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
        json: {
          name: "Should Not Apply",
        },
      },
      {
        headers: await authHeadersFor(memberIdentity),
      },
    );

    expect(response.status).toBe(403);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "forbidden", message: expect.any(String) });
  });

  it("returns 404 when a project does not exist", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: `project_missing_${randomUUID()}`,
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "project_not_found", message: expect.any(String) });
  });

  it("deletes an existing project", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$delete(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(204);

    const fetchResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"].$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(fetchResponse.status).toBe(404);
  });

  it("returns 404 when another organization deletes a project", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$delete(
      {
        param: {
          organizationSlug: ownerIdentity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
      },
      {
        headers: await authHeadersFor(otherIdentity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "project_not_found", message: expect.any(String) });

    const fetchResponse = await client.api.orgs[":organizationSlug"].projects[":projectId"].$get(
      {
        param: {
          organizationSlug: ownerIdentity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
      },
      {
        headers: await authHeadersFor(ownerIdentity),
      },
    );

    expect(fetchResponse.status).toBe(200);
  });

  it("returns 404 when deleting a project that does not exist", async () => {
    const identity = createWorkosIdentity();
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$delete(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: `project_missing_${randomUUID()}`,
        },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "project_not_found", message: expect.any(String) });
  });

  it("returns 403 when a member deletes a project", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const memberIdentity = createWorkosIdentityWithRole("member");
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$delete(
      {
        param: {
          organizationSlug: ownerIdentity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
      },
      {
        headers: await authHeadersFor(memberIdentity),
      },
    );

    expect(response.status).toBe(403);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "forbidden", message: expect.any(String) });
  });

  it("lists repository source files for a project", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;
    const projectId = createdBody.project.id;

    const [storedFile] = await db
      .insert(schema.storedFiles)
      .values({
        id: `file_${randomUUID()}`,
        organizationId: createdBody.project.organizationId,
        projectId,
        role: "source",
        sourceKind: "repository_file",
        storageProvider: "vercel_blob",
        storageKey: `test/${projectId}/en.json`,
        storageUrl: `https://example.com/${projectId}/en.json`,
        filename: "en.json",
        contentType: "application/json",
        byteSize: 120,
        sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        metadata: { sourcePath: "src/locale/en.json", sourceHash: "abc123" },
      })
      .returning();

    const [sourceFile] = await db
      .insert(schema.repositorySourceFiles)
      .values({
        organizationId: createdBody.project.organizationId,
        projectId,
        sourcePath: "src/locale/en.json",
      })
      .returning();

    await db.insert(schema.repositorySourceFileVersions).values({
      repositorySourceFileId: sourceFile.id,
      organizationId: createdBody.project.organizationId,
      projectId,
      sourcePath: "src/locale/en.json",
      storedFileId: storedFile.id,
      sourceHash: "abc123",
      commitSha: "deadbeef",
    });

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].files.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug", projectId },
        query: { limit: "500" },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFilesResponse;
    expect(body.files).toHaveLength(1);
    expect(body.files[0]).toMatchObject({
      sourcePath: "src/locale/en.json",
      sourceHash: "abc123",
      commitSha: "deadbeef",
      storedFileId: storedFile.id,
      filename: "en.json",
      byteSize: 120,
      latestJob: null,
    });
    expect(body.files[0].metadata).toMatchObject({
      sourcePath: "src/locale/en.json",
      sourceHash: "abc123",
    });
  });

  it("lists provider-backed files and keys for a project", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;
    const projectId = createdBody.project.id;

    await upsertExternalTmsFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      resourceType: "file",
      externalResourceId: "file-1",
      sourcePath: "locales/en/home.json",
      displayName: "home.json",
      format: "json",
      sourceLocale: "en",
      targetLocales: ["fr", "de"],
      sourceHash: "rev:one",
      revision: "one",
      externalUrl: "https://phrase.example.test/projects/phrase-project-1/files/file-1",
      syncState: "synced",
      localeReadiness: { fr: "ready", de: "missing" },
      providerPayload: { id: "file-1", name: "home.json" },
    });

    await upsertExternalTmsFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      resourceType: "key",
      externalResourceId: "key-1",
      sourcePath: "keys/home.hero.title",
      displayName: "home.hero.title",
      format: "icu",
      sourceLocale: "en",
      targetLocales: ["fr"],
      revision: "two",
      syncState: "pending",
      providerPayload: { id: "key-1", key: "home.hero.title" },
    });

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].files.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug", projectId },
        query: { limit: "500" },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFilesResponse;
    expect(body.files).toEqual([
      expect.objectContaining({
        origin: "provider",
        sourcePath: "keys/home.hero.title",
        sourceHash: null,
        storedFileId: null,
        filename: "home.hero.title",
        byteSize: null,
        metadata: { id: "key-1", key: "home.hero.title" },
        provider: expect.objectContaining({
          kind: "phrase",
          resourceType: "key",
          externalProjectId: "phrase-project-1",
          externalResourceId: "key-1",
          syncState: "pending",
          format: "icu",
          revision: "two",
        }),
        latestJob: null,
      }),
      expect.objectContaining({
        origin: "provider",
        sourcePath: "locales/en/home.json",
        sourceHash: "rev:one",
        filename: "home.json",
        provider: expect.objectContaining({
          kind: "phrase",
          resourceType: "file",
          externalUrl: "https://phrase.example.test/projects/phrase-project-1/files/file-1",
          sourceLocale: "en",
          targetLocales: ["fr", "de"],
          localeReadiness: { fr: "ready", de: "missing" },
        }),
      }),
    ]);
  });

  it("combines repository and provider records for the same source path", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;
    const projectId = createdBody.project.id;
    const sourcePath = "locales/en/home.json";

    const [storedFile] = await db
      .insert(schema.storedFiles)
      .values({
        id: `file_${randomUUID()}`,
        organizationId: createdBody.project.organizationId,
        projectId,
        role: "source",
        sourceKind: "repository_file",
        storageProvider: "vercel_blob",
        storageKey: `test/${projectId}/home.json`,
        storageUrl: `https://example.com/${projectId}/home.json`,
        filename: "home.json",
        contentType: "application/json",
        byteSize: 120,
        sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        metadata: { sourcePath },
      })
      .returning();

    const [sourceFile] = await db
      .insert(schema.repositorySourceFiles)
      .values({
        organizationId: createdBody.project.organizationId,
        projectId,
        sourcePath,
      })
      .returning();

    await db.insert(schema.repositorySourceFileVersions).values({
      repositorySourceFileId: sourceFile.id,
      organizationId: createdBody.project.organizationId,
      projectId,
      sourcePath,
      storedFileId: storedFile.id,
      sourceHash: "repo-hash",
      commitSha: "deadbeef",
    });

    await upsertExternalTmsFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      resourceType: "file",
      externalResourceId: "file-1",
      sourcePath,
      displayName: "home.json",
      format: "json",
      sourceLocale: "en",
      targetLocales: ["fr"],
      sourceHash: "provider-hash",
      revision: "one",
      syncState: "synced",
    });

    for (const origin of ["all", "repository", "provider"] as const) {
      const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].files.$get(
        {
          param: { organizationSlug: identity.organization.slug ?? "missing-slug", projectId },
          query: { limit: "500", origin },
        },
        {
          headers: await authHeadersFor(identity),
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as ProjectFilesResponse;
      expect(body.files).toHaveLength(1);
      expect(body.files[0]).toMatchObject({
        origin: "combined",
        sourcePath,
        sourceHash: "repo-hash",
        commitSha: "deadbeef",
        storedFileId: storedFile.id,
        filename: "home.json",
        byteSize: 120,
        provider: expect.objectContaining({
          kind: "phrase",
          externalResourceId: "file-1",
          syncState: "synced",
          revision: "one",
        }),
      });
    }
  });

  it("filters project files by resource type and provider kind", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;
    const projectId = createdBody.project.id;

    await upsertExternalTmsFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      resourceType: "file",
      externalResourceId: "file-1",
      sourcePath: "locales/en/home.json",
      displayName: "home.json",
      syncState: "synced",
    });

    await upsertExternalTmsFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      providerKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      resourceType: "key",
      externalResourceId: "key-1",
      sourcePath: "keys/home.title",
      displayName: "home.title",
      syncState: "pending",
    });

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].files.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug", projectId },
        query: { limit: "500", resourceType: "key", providerKind: "crowdin" },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFilesResponse;
    expect(body.files).toEqual([
      expect.objectContaining({
        sourcePath: "keys/home.title",
        provider: expect.objectContaining({
          kind: "crowdin",
          resourceType: "key",
        }),
      }),
    ]);
  });

  it("limits provider-backed files when listing project files", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;
    const projectId = createdBody.project.id;

    for (const sourcePath of ["keys/alpha", "keys/beta"]) {
      await upsertExternalTmsFile({
        organizationId: createdBody.project.organizationId,
        projectId,
        providerKind: "phrase",
        externalProjectId: "phrase-project-1",
        resourceType: "key",
        externalResourceId: sourcePath,
        sourcePath,
      });
    }

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].files.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug", projectId },
        query: { limit: "1" },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFilesResponse;
    expect(body.files.map((file) => file.sourcePath)).toEqual(["keys/alpha"]);
  });

  it("returns 404 when another organization fetches project files", async () => {
    const ownerIdentity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(ownerIdentity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;

    const otherIdentity = createWorkosIdentity();
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].files.$get(
      {
        param: {
          organizationSlug: otherIdentity.organization.slug ?? "missing-slug",
          projectId: createdBody.project.id,
        },
        query: { limit: "500" },
      },
      {
        headers: await authHeadersFor(otherIdentity),
      },
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "project_not_found", message: expect.any(String) });
  });

  it("returns source version detail with diffs inputs and translation outputs", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;
    const projectId = createdBody.project.id;
    const sourcePath = "src/locale/en.json";

    const olderSource = await createStoredFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      role: "source",
      sourceKind: "repository_file",
      filename: "en.json",
      contentType: "application/json",
      content: Buffer.from('{"hello":"Hello"}'),
      metadata: { sourcePath, sourceHash: "sha256:older" },
      adapter: fileStorageAdapter,
    });
    const olderVersion = await createRepositorySourceFileVersion({
      storedFile: olderSource,
      sourcePath,
      sourceHash: "sha256:older",
      commitSha: "1111111111",
      workflowRunId: "run_older",
    });

    const newerSource = await createStoredFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      role: "source",
      sourceKind: "repository_file",
      filename: "en.json",
      contentType: "application/json",
      content: Buffer.from('{"hello":"Hello world"}'),
      metadata: { sourcePath, sourceHash: "sha256:newer" },
      adapter: fileStorageAdapter,
    });
    const newerVersion = await createRepositorySourceFileVersion({
      storedFile: newerSource,
      sourcePath,
      sourceHash: "sha256:newer",
      commitSha: "2222222222",
      workflowRunId: "run_newer",
    });

    await db
      .update(schema.repositorySourceFileVersions)
      .set({ createdAt: new Date("2026-05-19T10:00:00.000Z") })
      .where(eq(schema.repositorySourceFileVersions.id, olderVersion.id));
    await db
      .update(schema.repositorySourceFileVersions)
      .set({ createdAt: new Date("2026-05-19T11:00:00.000Z") })
      .where(eq(schema.repositorySourceFileVersions.id, newerVersion.id));

    await db.insert(schema.jobs).values({
      id: "job_newer_fr",
      organizationId: createdBody.project.organizationId,
      projectId,
      kind: "translation",
      status: "succeeded",
      inputPayload: {
        sourceFileId: newerSource.id,
        fileFormat: "json",
        sourceLocale: "en",
        targetLocales: ["fr"],
      },
      workflowRunId: "workflow_translation",
      createdAt: new Date("2026-05-19T11:05:00.000Z"),
      completedAt: new Date("2026-05-19T11:30:00.000Z"),
    });
    await db.insert(schema.translationJobDetails).values({
      jobId: "job_newer_fr",
      type: "file",
      sourceFileVersionId: newerVersion.id,
      outcomeKind: "file_result",
    });

    const outputFile = await createStoredFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      role: "output",
      sourceKind: "job_output",
      sourceJobId: "job_newer_fr",
      filename: "fr.json",
      contentType: "application/json",
      content: Buffer.from('{"hello":"Bonjour le monde"}'),
      metadata: {},
      adapter: fileStorageAdapter,
    });
    await db
      .update(schema.jobs)
      .set({
        outcomePayload: {
          outputFiles: [{ fileId: outputFile.id, locale: "fr", filename: "fr.json" }],
        },
      })
      .where(eq(schema.jobs.id, "job_newer_fr"));

    const response = await fileDetailClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug", projectId },
        query: { sourcePath: `./${sourcePath}` },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFileDetailResponse;
    expect(body.file.versions.map((version) => version.id)).toEqual([
      newerVersion.id,
      olderVersion.id,
    ]);
    expect(body.file.versions[0]).toMatchObject({
      origin: "repository",
      sourceHash: "sha256:newer",
      revision: null,
      commitSha: "2222222222",
      workflowRunId: "run_newer",
      content: { text: '{"hello":"Hello world"}' },
    });
    expect(body.file.provider).toBeNull();
    expect(body.file.providerJobsByLocale).toEqual([]);
    expect(body.file.jobsByLocale).toEqual([
      {
        locale: "fr",
        jobs: [
          expect.objectContaining({
            id: "job_newer_fr",
            sourceFileVersionId: newerVersion.id,
            targetLocales: ["fr"],
            outputs: [
              expect.objectContaining({
                fileId: outputFile.id,
                locale: "fr",
                filename: "fr.json",
                byteSize: Buffer.byteLength('{"hello":"Bonjour le monde"}'),
                sha256: outputFile.sha256,
                downloadPath: `/api/orgs/${identity.organization.slug}/files/${outputFile.id}`,
                content: { text: '{"hello":"Bonjour le monde"}' },
              }),
            ],
          }),
        ],
      },
    ]);
  });

  it("returns provider-backed file detail with versions and linked provider jobs", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;
    const projectId = createdBody.project.id;
    const sourcePath = "locales/en/home.json";

    const olderSource = await createStoredFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      role: "source",
      sourceKind: "tms_file",
      filename: "home.json",
      contentType: "application/json",
      content: Buffer.from('{"title":"Hello"}'),
      metadata: {},
      adapter: fileStorageAdapter,
    });
    const newerSource = await createStoredFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      role: "source",
      sourceKind: "tms_file",
      filename: "home.json",
      contentType: "application/json",
      content: Buffer.from('{"title":"Hello world"}'),
      metadata: {},
      adapter: fileStorageAdapter,
    });

    await upsertExternalTmsFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      resourceType: "file",
      externalResourceId: "file-1",
      sourcePath,
      displayName: "home.json",
      format: "json",
      sourceLocale: "en",
      targetLocales: ["fr"],
      sourceHash: "rev:one",
      revision: "one",
      storedFileId: olderSource.id,
      syncState: "synced",
      localeReadiness: { fr: "ready" },
      providerPayload: { id: "file-1" },
    });

    await upsertExternalTmsFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      resourceType: "file",
      externalResourceId: "file-1",
      sourcePath,
      displayName: "home.json",
      format: "json",
      sourceLocale: "en",
      targetLocales: ["fr"],
      sourceHash: "rev:two",
      revision: "two",
      storedFileId: newerSource.id,
      syncState: "synced",
      localeReadiness: { fr: "ready" },
      providerPayload: { id: "file-1" },
    });

    const externalJob = await upsertExternalJob({
      organizationId: createdBody.project.organizationId,
      projectId,
      providerKind: "phrase",
      externalJobId: "phrase-job-1",
      externalStatus: "in_progress",
      title: "Homepage copy",
      targetLocales: ["fr"],
      providerPayload: { fileIds: ["file-1"] },
    });

    const response = await fileDetailClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug", projectId },
        query: { sourcePath },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFileDetailResponse;
    expect(body.file.provider).toMatchObject({
      kind: "phrase",
      externalResourceId: "file-1",
      revision: "two",
    });
    expect(body.file.versions).toHaveLength(2);
    expect(body.file.versions[0]).toMatchObject({
      origin: "provider",
      revision: "two",
      content: { text: '{"title":"Hello world"}' },
    });
    expect(body.file.versions[1]).toMatchObject({
      origin: "provider",
      revision: "one",
      content: { text: '{"title":"Hello"}' },
    });
    expect(body.file.providerJobsByLocale).toEqual([
      {
        locale: "fr",
        jobs: [
          expect.objectContaining({
            id: externalJob.id,
            externalJobId: "phrase-job-1",
            title: "Homepage copy",
          }),
        ],
      },
    ]);
  });

  it("returns 400 for missing sourcePath query param on file detail", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity);
    const createdBody = (await createdResponse.json()) as ProjectResponse;
    const projectId = createdBody.project.id;

    const response = await fileDetailClient.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.detail.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug", projectId },
        query: { sourcePath: "" },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      error: "invalid_project_payload",
      message: expect.any(String),
    });
  });
});
