/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import { encodeProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { createProjectTestFixture } from "./project.fixture";
import type {
  ProjectFilesResponse,
  ProjectProviderBranchesResponse,
  ProjectResponse,
} from "./project.schema";

const {
  countTmsProviderLiveOpenJobsForProjectMock,
  getTmsProviderLiveProjectMock,
  listTmsProviderLiveFilesForProjectMock,
  listTmsProviderLiveProjectBranchesMock,
  resolveApiAuthContextFromSessionMock,
} = vi.hoisted(() => ({
  countTmsProviderLiveOpenJobsForProjectMock: vi.fn(),
  getTmsProviderLiveProjectMock: vi.fn(),
  listTmsProviderLiveFilesForProjectMock: vi.fn(),
  listTmsProviderLiveProjectBranchesMock: vi.fn(),
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

vi.mock("@/lib/providers/jobs/tms-provider-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/jobs/tms-provider-live")>();
  return {
    ...actual,
    getTmsProviderLiveProject: getTmsProviderLiveProjectMock,
    countTmsProviderLiveOpenJobsForProject: countTmsProviderLiveOpenJobsForProjectMock,
    listTmsProviderLiveFilesForProject: listTmsProviderLiveFilesForProjectMock,
    listTmsProviderLiveProjectBranches: listTmsProviderLiveProjectBranchesMock,
  };
});

const client = testClient(app);
const projectFixture = createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

describe("project CAT behavior routes", () => {
  it("defaults projects to opt-out and previews exact duplicate source strings", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    await db.insert(schema.projectTranslationKeys).values([
      {
        organizationId: organization.id,
        projectId: project.id,
        key: "a",
        sourceText: "Save",
        normalizedSourceText: "save",
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        key: "b",
        sourceText: "Save",
        normalizedSourceText: "save",
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        key: "c",
        sourceText: "SAVE",
        normalizedSourceText: "save",
      },
    ]);

    const current = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "cat-behavior"
    ].$get(
      { param: { organizationSlug: identity.organization.slug!, projectId: project.id } },
      { headers },
    );
    expect(current.status).toBe(200);
    await expect(current.json()).resolves.toMatchObject({
      catBehavior: {
        automaticallyGroupIdenticalStrings: false,
        groupingRevision: 0,
        canManage: true,
      },
    });

    const preview = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "cat-behavior"
    ].preview.$get(
      { param: { organizationSlug: identity.organization.slug!, projectId: project.id } },
      { headers },
    );
    expect(preview.status).toBe(200);
    await expect(preview.json()).resolves.toEqual({
      preview: { affectedOccurrences: 2, groups: 1 },
    });
  });

  it("lets managers change only policy state and increments the grouping revision", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "cat-behavior"
    ].$patch(
      {
        param: { organizationSlug: identity.organization.slug!, projectId: project.id },
        json: { automaticallyGroupIdenticalStrings: true },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      catBehavior: { automaticallyGroupIdenticalStrings: true, groupingRevision: 1 },
    });
    const [stored] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, project.id));
    expect(stored).toMatchObject({
      name: project.name,
      automaticallyGroupIdenticalStrings: true,
      catGroupingRevision: 1,
    });
  });

  it("previews zero impact when no duplicate source strings exist", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);
    await db.insert(schema.projectTranslationKeys).values([
      {
        organizationId: organization.id,
        projectId: project.id,
        key: "unique-a",
        sourceText: "Hello",
        normalizedSourceText: "hello",
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        key: "unique-b",
        sourceText: "World",
        normalizedSourceText: "world",
      },
    ]);

    const preview = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "cat-behavior"
    ].preview.$get(
      { param: { organizationSlug: identity.organization.slug!, projectId: project.id } },
      { headers },
    );

    expect(preview.status).toBe(200);
    await expect(preview.json()).resolves.toEqual({
      preview: { affectedOccurrences: 0, groups: 0 },
    });
  });

  it("does not bump the grouping revision when the policy value is unchanged", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const enable = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "cat-behavior"
    ].$patch(
      {
        param: { organizationSlug: identity.organization.slug!, projectId: project.id },
        json: { automaticallyGroupIdenticalStrings: true },
      },
      { headers },
    );
    expect(enable.status).toBe(200);

    const noop = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "cat-behavior"
    ].$patch(
      {
        param: { organizationSlug: identity.organization.slug!, projectId: project.id },
        json: { automaticallyGroupIdenticalStrings: true },
      },
      { headers },
    );

    expect(noop.status).toBe(200);
    await expect(noop.json()).resolves.toMatchObject({
      catBehavior: { automaticallyGroupIdenticalStrings: true, groupingRevision: 1 },
    });
    const [stored] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, project.id));
    expect(stored?.catGroupingRevision).toBe(1);
  });

  it("forbids translators from previewing or changing CAT policy", async () => {
    const manager = projectFixture.createWorkosIdentityWithRole("admin");
    await projectFixture.authHeadersFor(manager);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const team = await ensureDefaultWorkspaceTeam(organizationId);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId,
        teamId: team.id,
        name: "Restricted",
        sourceLocale: "en",
        targetLocales: ["fr"],
      })
      .returning();
    const translator = projectFixture.createWorkosIdentityForOrganization(
      manager.organization,
      "translator",
    );
    const translatorHeaders = await projectFixture.authHeadersFor(translator);

    const preview = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "cat-behavior"
    ].preview.$get(
      { param: { organizationSlug: translator.organization.slug!, projectId: project.id } },
      { headers: translatorHeaders },
    );
    const update = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "cat-behavior"
    ].$patch(
      {
        param: { organizationSlug: translator.organization.slug!, projectId: project.id },
        json: { automaticallyGroupIdenticalStrings: true },
      },
      { headers: translatorHeaders },
    );

    expect(preview.status).toBe(403);
    expect(update.status).toBe(403);
  });
});

describe("project detail route", () => {
  it("returns a materialized external TMS project when the live provider lookup misses", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const headers = await projectFixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;
    const externalProjectId = "902807";
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId,
    });

    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    await db.insert(schema.projects).values({
      id: projectId,
      identifier: uniqueTestProjectIdentifier(),
      organizationId,
      teamId: null,
      createdByUserId: userId,
      updatedByUserId: userId,
      name: "Materialized Crowdin Project",
      description: "Stored after provider sync",
      translationContext: "Use a concise help-center tone.",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProviderCredentialId: credential.id,
      externalProjectId,
      sourceLocale: "en",
      targetLocales: ["fr", "de"],
      isActive: true,
    });
    await db.insert(schema.jobs).values({
      id: `job_${randomUUID()}`,
      organizationId,
      projectId,
      createdByUserId: userId,
      ownerUserId: null,
      kind: "translation",
      status: "queued",
      inputPayload: {
        sourceText: "Hello",
        sourceLocale: "en",
        targetLocales: ["fr"],
      },
    });
    getTmsProviderLiveProjectMock.mockResolvedValue(null);

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$get(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectResponse;
    expect(body.project).toMatchObject({
      id: projectId,
      organizationId,
      name: "Materialized Crowdin Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId,
      sourceLocale: "en",
      targetLocales: ["fr", "de"],
      openJobCount: 1,
    });
    expect(getTmsProviderLiveProjectMock).toHaveBeenCalledTimes(1);
    expect(getTmsProviderLiveProjectMock).toHaveBeenCalledWith(organizationId, externalProjectId, {
      actorUserId: userId,
    });
  });

  it("returns the live provider open job count from the dedicated endpoint", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const headers = await projectFixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;
    const externalProjectId = "902808";
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId,
    });

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    countTmsProviderLiveOpenJobsForProjectMock.mockResolvedValue(3);

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"][
      "open-job-count"
    ].$get(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { openJobCount: number };
    expect(body).toEqual({ openJobCount: 3 });
    expect(countTmsProviderLiveOpenJobsForProjectMock).toHaveBeenCalledWith(
      organizationId,
      externalProjectId,
      { actorUserId: userId },
    );
  });

  it("returns openJobCount 0 on the project payload for live provider projects", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const headers = await projectFixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;
    const externalProjectId = "902808";
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId,
    });

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    getTmsProviderLiveProjectMock.mockResolvedValue({
      id: projectId,
      name: "Live Crowdin Project",
      description: null,
      translationContext: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId,
      sourceLocale: "en",
      targetLocales: ["fr"],
      externalProjectUrl: "https://crowdin.com/project/live",
      isActive: true,
    });

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$get(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectResponse;
    expect(body.project).toMatchObject({
      id: projectId,
      source: "external_tms",
      externalProjectId,
      openJobCount: 0,
    });
  });
});

describe("project file provider routes", () => {
  it("lists live provider branches for provider-backed projects", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const headers = await projectFixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;
    const externalProjectId = "902809";
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId,
    });

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });
    listTmsProviderLiveProjectBranchesMock.mockResolvedValue([
      { name: "main", title: "Main" },
      { name: "release/ios", title: null },
    ]);

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.branches.$get(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectProviderBranchesResponse;
    expect(body).toEqual({
      branches: [
        { name: "main", title: "Main" },
        { name: "release/ios", title: null },
      ],
    });
    expect(listTmsProviderLiveProjectBranchesMock).toHaveBeenCalledTimes(1);
    expect(listTmsProviderLiveProjectBranchesMock).toHaveBeenCalledWith(
      organizationId,
      externalProjectId,
      { actorUserId: userId },
    );
  });

  it("returns an empty branch list for native projects without calling the live provider", async () => {
    const { identity, project } = await projectFixture.createStoredProjectFixture();
    const headers = await projectFixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.branches.$get(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing-slug",
          projectId: project.id,
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectProviderBranchesResponse;
    expect(body).toEqual({ branches: [] });
    expect(listTmsProviderLiveProjectBranchesMock).not.toHaveBeenCalled();
  });

  it("returns provider unavailable when a provider project has no active matching connection", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const headers = await projectFixture.authHeadersFor(admin);
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId: "902810",
    });

    const response = await client.api.orgs[":organizationSlug"].projects[
      ":projectId"
    ].files.branches.$get(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId,
        },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string; message: string };
    expect(body).toMatchObject({
      error: "no_active_tms_provider",
    });
    expect(listTmsProviderLiveProjectBranchesMock).not.toHaveBeenCalled();
  });

  it("passes branch filters through when listing live provider project files", async () => {
    const admin = projectFixture.createWorkosIdentityWithRole("admin");
    const headers = await projectFixture.authHeadersFor(admin);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext!.user.localUserId;
    const externalProjectId = "902811";
    const projectId = encodeProviderProjectId({
      providerKind: "crowdin",
      externalProjectId,
    });

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });
    listTmsProviderLiveFilesForProjectMock.mockResolvedValue([
      {
        origin: "provider",
        sourcePath: "/strings/en.json",
        sourceHash: null,
        commitSha: null,
        workflowRunId: null,
        uploadedAt: "2026-07-04T00:00:00.000Z",
        storedFileId: null,
        metadata: {},
        filename: "en.json",
        byteSize: null,
        provider: {
          kind: "crowdin",
          resourceType: "file",
          externalProjectId,
          externalResourceId: "file-123",
          externalUrl: null,
          syncState: "synced",
          sourceLocale: "en",
          targetLocales: ["fr"],
          localeReadiness: {},
          revision: null,
          format: null,
          lastSyncedAt: null,
        },
        latestJob: null,
      },
    ]);

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].files.$get(
      {
        param: {
          organizationSlug: admin.organization.slug ?? "missing-slug",
          projectId,
        },
        query: {
          branch: "release/ios",
          limit: "25",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectFilesResponse;
    expect(body.files).toHaveLength(1);
    expect(body.files[0]).toMatchObject({
      origin: "provider",
      sourcePath: "/strings/en.json",
      provider: {
        kind: "crowdin",
        externalProjectId,
        externalResourceId: "file-123",
      },
    });
    expect(listTmsProviderLiveFilesForProjectMock).toHaveBeenCalledTimes(1);
    expect(listTmsProviderLiveFilesForProjectMock).toHaveBeenCalledWith(
      organizationId,
      externalProjectId,
      { limit: 25, branch: "release/ios", actorUserId: userId },
    );
  });
});

describe("project identifier uniqueness", () => {
  it("rejects an identifier already used by another project in the same organization", async () => {
    const owner = await projectFixture.createStoredProjectFixture();
    const team = await ensureDefaultWorkspaceTeam(owner.organization.id);
    const sharedPrefix = uniqueTestProjectIdentifier();

    await db
      .update(schema.projects)
      .set({ identifier: sharedPrefix })
      .where(eq(schema.projects.id, owner.project.id));

    const [otherProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: owner.organization.id,
        teamId: team.id,
        createdByUserId: owner.user.id,
        name: "Other Docs",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$patch(
      {
        param: {
          organizationSlug: owner.identity.organization.slug ?? "missing-slug",
          projectId: otherProject.id,
        },
        json: { identifier: sharedPrefix },
      },
      { headers: await projectFixture.authHeadersFor(owner.identity) },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("identifier_taken");
  });

  it("allows the same identifier in a different organization", async () => {
    const owner = await projectFixture.createStoredProjectFixture();
    const other = await projectFixture.createStoredProjectFixture();
    const sharedPrefix = uniqueTestProjectIdentifier();

    await db
      .update(schema.projects)
      .set({ identifier: sharedPrefix })
      .where(eq(schema.projects.id, owner.project.id));

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$patch(
      {
        param: {
          organizationSlug: other.identity.organization.slug ?? "missing-slug",
          projectId: other.project.id,
        },
        json: { identifier: sharedPrefix },
      },
      { headers: await projectFixture.authHeadersFor(other.identity) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectResponse;
    expect(body.project.identifier).toBe(sharedPrefix);
  });

  it("ignores stale metadata when renaming an external project identifier", async () => {
    const owner = await projectFixture.createStoredProjectFixture();
    const nextIdentifier = uniqueTestProjectIdentifier();

    await db
      .update(schema.projects)
      .set({
        source: "external_tms",
        name: "Provider Name",
        description: "Provider description",
        translationContext: "Provider context",
      })
      .where(eq(schema.projects.id, owner.project.id));

    const response = await client.api.orgs[":organizationSlug"].projects[":projectId"].$patch(
      {
        param: {
          organizationSlug: owner.identity.organization.slug ?? "missing-slug",
          projectId: owner.project.id,
        },
        json: {
          identifier: nextIdentifier,
          name: "Stale form name",
          description: "Stale description",
          translationContext: "Stale context",
        },
      },
      { headers: await projectFixture.authHeadersFor(owner.identity) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ProjectResponse;
    expect(body.project).toMatchObject({
      identifier: nextIdentifier,
      name: "Provider Name",
      description: "Provider description",
      translationContext: "Provider context",
    });
  });
});
