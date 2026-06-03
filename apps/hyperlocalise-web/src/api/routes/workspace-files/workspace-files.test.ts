import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { upsertExternalTmsFile } from "@/lib/providers/sync/organization-external-tms-files";

import { createProjectTestFixture } from "../project/project.fixture";
import type { ProjectResponse, WorkspaceFilesResponse } from "../project/project.schema";

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
const projectFixture = createProjectTestFixture(client);
const { authHeadersFor, createProjectViaApi, createWorkosIdentity } = projectFixture;

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

describe("workspace files API", () => {
  it("filters files for a double-encoded external project query id", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity, { name: "Crowdin project" });
    const createdBody = (await createdResponse.json()) as ProjectResponse;
    const projectId = `ext:crowdin:${createdBody.project.id}`;
    const encodedProjectId = encodeURIComponent(encodeURIComponent(projectId));

    await db
      .update(schema.projects)
      .set({ id: projectId })
      .where(eq(schema.projects.id, createdBody.project.id));

    await upsertExternalTmsFile({
      organizationId: createdBody.project.organizationId,
      projectId,
      providerKind: "crowdin",
      externalProjectId: "902807",
      resourceType: "key",
      externalResourceId: "key-1",
      sourcePath: "keys/home.title",
      displayName: "home.title",
      syncState: "synced",
    });

    const response = await client.api.orgs[":organizationSlug"]["workspace-files"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { limit: "500", projectId: encodedProjectId },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as WorkspaceFilesResponse;
    expect(body.files).toHaveLength(1);
    expect(body.files[0]).toMatchObject({
      projectId,
      projectName: "Crowdin project",
      sourcePath: "keys/home.title",
    });
  });

  it("lists provider-backed files across projects with project metadata", async () => {
    const identity = createWorkosIdentity();
    const createdResponse = await createProjectViaApi(identity, { name: "Marketing site" });
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
      lastSyncedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const response = await client.api.orgs[":organizationSlug"]["workspace-files"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        query: { limit: "500", origin: "provider" },
      },
      {
        headers: await authHeadersFor(identity),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as WorkspaceFilesResponse;
    expect(body.files).toEqual([
      expect.objectContaining({
        projectId,
        projectName: "Marketing site",
        origin: "provider",
        sourcePath: "locales/en/home.json",
        provider: expect.objectContaining({
          kind: "phrase",
          resourceType: "file",
          syncState: "synced",
          lastSyncedAt: "2026-01-02T00:00:00.000Z",
        }),
      }),
    ]);
  });
});
