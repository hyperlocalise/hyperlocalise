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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  enqueueActivityLogEventMock,
  canReadGitLabRepositoryMock,
  getGitLabProjectMock,
  getGitLabTokenAbilitiesMock,
  listGitLabMembershipProjectsMock,
  loadGitLabConnectionCredentialsMock,
  resolveApiAuthContextFromSessionMock,
} = vi.hoisted(() => ({
  enqueueActivityLogEventMock: vi.fn(async () => ({ ok: true as const, value: {} })),
  canReadGitLabRepositoryMock: vi.fn(),
  getGitLabProjectMock: vi.fn(),
  getGitLabTokenAbilitiesMock: vi.fn(),
  listGitLabMembershipProjectsMock: vi.fn(),
  loadGitLabConnectionCredentialsMock: vi.fn(),
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

vi.mock("@/lib/gitlab/connections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gitlab/connections")>()),
  loadGitLabConnectionCredentials: loadGitLabConnectionCredentialsMock,
}));

vi.mock("@/lib/gitlab/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gitlab/client")>()),
  canReadGitLabRepository: canReadGitLabRepositoryMock,
  getGitLabProject: getGitLabProjectMock,
  getGitLabTokenAbilities: getGitLabTokenAbilitiesMock,
  listGitLabMembershipProjects: listGitLabMembershipProjectsMock,
}));

vi.mock("@/lib/activity-log/activity-log-writer", () => ({
  enqueueActivityLogEvent: enqueueActivityLogEventMock,
  enqueueActivityLogEvents: vi.fn(async () => []),
}));

import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { contentSyncFingerprintFromConfig } from "@/lib/agents/content-sync/content-sync-config";
import { db, schema } from "@/lib/database/client";
import type { GitLabProject } from "@/lib/gitlab/types";
import { err, ok } from "@/lib/primitives/result/results";
import { saveProjectContentSync } from "@/lib/projects/content-sync/project-content-sync";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { createProjectTestFixture } from "./project.fixture";

const enqueue = vi.fn(async () => ({ ids: ["queued"] }));
const client = testClient<AppType>(createApp({ projectContentSyncQueue: { enqueue } }));
const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(null));
  getGitLabTokenAbilitiesMock.mockReset();
  getGitLabTokenAbilitiesMock.mockResolvedValue(ok(null));
  canReadGitLabRepositoryMock.mockReset();
  canReadGitLabRepositoryMock.mockResolvedValue(ok(true));
});

afterEach(async () => {
  vi.clearAllMocks();
  await projectFixture.cleanup();
});

async function seedWorkspace(options: { source?: "native" | "external_tms" } = {}) {
  const admin = projectFixture.createWorkosIdentityWithRole("admin");
  const { organization, user } = await projectFixture.createLocalWorkosIdentity(admin);
  const team = await ensureDefaultWorkspaceTeam(organization.id);
  const source = options.source ?? "native";
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      identifier: uniqueTestProjectIdentifier(),
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: user.id,
      name: "Sync project",
      source,
      ...(source === "external_tms"
        ? { externalProviderKind: "phrase" as const, externalProjectId: "42" }
        : {}),
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();

  const suffix = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 12)}`)
    .toString()
    .slice(0, 12);
  const githubInstallationId = `7${suffix}`;
  await db.insert(schema.githubInstallations).values({
    organizationId: organization.id,
    githubInstallationId,
    githubAppId: "123",
    accountLogin: "acme",
    accountType: "Organization",
  });
  const [repository] = await db
    .insert(schema.githubInstallationRepositories)
    .values({
      organizationId: organization.id,
      githubInstallationId,
      githubRepositoryId: `6${suffix}`,
      owner: "acme",
      name: "web",
      fullName: "acme/web",
      private: true,
      archived: false,
      defaultBranch: "main",
      enabled: true,
    })
    .returning();

  return { admin, organization, project: project!, repository: repository! };
}

/** A GitHub sync saved before new ones moved to Integrations; it can still be changed. */
async function seedGitHubSync(input: {
  organizationId: string;
  projectId: string;
  repositoryId: string;
}) {
  await saveProjectContentSync({
    organizationId: input.organizationId,
    projectId: input.projectId,
    syncConfig: { ...syncBody(input.repositoryId).syncConfig, resourceKey: "acme/web" },
    schedule: "manual",
    userId: null,
  });
}

function routeFor() {
  return client.api.orgs[":organizationSlug"].projects[":projectId"]["content-sync"];
}

function paramFor(identity: WorkosAuthIdentity, projectId: string) {
  return { organizationSlug: identity.organization.slug ?? "missing-slug", projectId };
}

function syncBody(connectionId: string) {
  return {
    schedule: "hourly" as const,
    syncConfig: {
      provider: "github" as const,
      connectionId,
      // The server takes the repository name from the connection, not from the request.
      resourceKey: "someone/else",
      providerFolder: "locales/",
      projectFolder: "github/acme/web",
    },
  };
}

describe("project content sync routes", () => {
  it("saves settings, starts a run and lists it", async () => {
    const { admin, project, repository } = await seedWorkspace();
    const headers = await projectFixture.authHeadersFor(admin);
    const param = paramFor(admin, project.id);

    const empty = await routeFor().$get({ param }, { headers });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ contentSync: { sync: null, runs: [] } });

    const connections = await routeFor().connections.$get({ param, query: {} }, { headers });
    expect(await connections.json()).toEqual({
      connections: [
        {
          provider: "github",
          connectionId: repository.id,
          resourceKey: "acme/web",
          branch: "main",
        },
      ],
      gitlab: { connected: false, available: false, connectionId: null, tokenCanSend: null },
      gitlabConnections: [],
    });

    const refused = await routeFor().$put({ param, json: syncBody(repository.id) }, { headers });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ error: "content_sync_github_in_integrations" });

    await seedGitHubSync({
      organizationId: project.organizationId,
      projectId: project.id,
      repositoryId: repository.id,
    });
    const saved = await routeFor().$put({ param, json: syncBody(repository.id) }, { headers });
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as { sync: { syncConfig: Record<string, unknown> } };
    expect(savedBody.sync.syncConfig).toMatchObject({
      resourceKey: "acme/web",
      providerFolder: "locales",
    });
    expect(enqueueActivityLogEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "project_settings_changed",
        payload: { changedFields: ["sync"], projectId: project.id },
      }),
    );

    const started = await routeFor().runs.$post({ param }, { headers });
    expect(started.status).toBe(202);
    expect(enqueue).toHaveBeenCalledTimes(1);

    const again = await routeFor().runs.$post({ param }, { headers });
    expect(again.status).toBe(409);

    const listed = await routeFor().$get({ param }, { headers });
    const listedBody = (await listed.json()) as {
      contentSync: { runs: Array<{ status: string; trigger: string }> };
    };
    expect(listedBody.contentSync.runs).toEqual([
      expect.objectContaining({ status: "running", trigger: "manual" }),
    ]);

    const busy = await routeFor().$delete({ param }, { headers });
    expect(busy.status).toBe(409);

    await db
      .update(schema.projectContentSyncRuns)
      .set({ status: "succeeded" })
      .where(eq(schema.projectContentSyncRuns.projectId, project.id));
    const removed = await routeFor().$delete({ param }, { headers });
    expect(removed.status).toBe(204);
    const runs = await db
      .select()
      .from(schema.projectContentSyncRuns)
      .where(eq(schema.projectContentSyncRuns.projectId, project.id));
    expect(runs).toHaveLength(0);
  });

  it("lets members read but not change the sync", async () => {
    const { admin, project, repository } = await seedWorkspace();
    await seedGitHubSync({
      organizationId: project.organizationId,
      projectId: project.id,
      repositoryId: repository.id,
    });

    const member = projectFixture.createWorkosIdentityForOrganization(admin.organization, "member");
    const memberHeaders = await projectFixture.authHeadersFor(member);
    const param = paramFor(member, project.id);
    await db.insert(schema.teamMemberships).values({
      teamId: project.teamId!,
      userId: await projectFixture.getLocalUserId(member.user.workosUserId),
      role: "member",
    });

    const read = await routeFor().$get({ param }, { headers: memberHeaders });
    expect(read.status).toBe(200);

    const write = await routeFor().$put(
      { param, json: syncBody(repository.id) },
      { headers: memberHeaders },
    );
    expect(write.status).toBe(403);
    const run = await routeFor().runs.$post({ param }, { headers: memberHeaders });
    expect(run.status).toBe(403);
    const connections = await routeFor().connections.$get(
      { param, query: {} },
      { headers: memberHeaders },
    );
    expect(connections.status).toBe(403);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("refuses another workspace's repository, a disabled one and other providers", async () => {
    const { admin, project, repository } = await seedWorkspace();
    const other = await seedWorkspace();
    await seedGitHubSync({
      organizationId: project.organizationId,
      projectId: project.id,
      repositoryId: repository.id,
    });
    const headers = await projectFixture.authHeadersFor(admin);
    const param = paramFor(admin, project.id);

    const foreign = await routeFor().$put(
      { param, json: syncBody(other.repository.id) },
      { headers },
    );
    expect(foreign.status).toBe(400);
    expect(await foreign.json()).toMatchObject({ error: "content_sync_connection_required" });

    await db
      .update(schema.githubInstallationRepositories)
      .set({ enabled: false })
      .where(eq(schema.githubInstallationRepositories.id, repository.id));
    const disabled = await routeFor().$put({ param, json: syncBody(repository.id) }, { headers });
    expect(disabled.status).toBe(400);

    const contentful = await routeFor().$put(
      {
        param,
        json: {
          ...syncBody(repository.id),
          syncConfig: { ...syncBody(repository.id).syncConfig, provider: "contentful" },
        },
      },
      { headers },
    );
    expect(contentful.status).toBe(400);
    expect(await contentful.json()).toMatchObject({ error: "content_sync_provider_not_ready" });

    const noFolder = await routeFor().$put(
      {
        param,
        json: {
          ...syncBody(repository.id),
          syncConfig: { ...syncBody(repository.id).syncConfig, providerFolder: "" },
        },
      },
      { headers },
    );
    expect(noFolder.status).toBe(400);
    expect(await noFolder.json()).toMatchObject({ error: "content_sync_provider_folder_required" });
  });

  it("asks for settings before Sync now and is not offered on external projects", async () => {
    const { admin, project } = await seedWorkspace();
    const external = await seedWorkspace({ source: "external_tms" });
    const headers = await projectFixture.authHeadersFor(admin);

    const run = await routeFor().runs.$post({ param: paramFor(admin, project.id) }, { headers });
    expect(run.status).toBe(404);

    const externalRun = await routeFor().runs.$post(
      { param: paramFor(external.admin, external.project.id) },
      { headers: await projectFixture.authHeadersFor(external.admin) },
    );
    expect(externalRun.status).toBe(400);

    const externalHeaders = await projectFixture.authHeadersFor(external.admin);
    const read = await routeFor().$get(
      { param: paramFor(external.admin, external.project.id) },
      { headers: externalHeaders },
    );
    expect(read.status).toBe(400);
    expect(await read.json()).toMatchObject({ error: "content_sync_not_supported" });
  });

  it("refuses a sync that an active content sync automation already covers", async () => {
    const { admin, organization, project, repository } = await seedWorkspace();
    await seedGitHubSync({
      organizationId: project.organizationId,
      projectId: project.id,
      repositoryId: repository.id,
    });
    const headers = await projectFixture.authHeadersFor(admin);
    const body = syncBody(repository.id);
    await db.insert(schema.workspaceAutomations).values({
      organizationId: organization.id,
      kind: "content_sync",
      name: "Sync acme/web",
      instructions: "",
      projectId: project.id,
      syncConfig: { ...body.syncConfig, resourceKey: "acme/web" },
      syncFingerprint: contentSyncFingerprintFromConfig({
        ...body.syncConfig,
        resourceKey: "acme/web",
      }),
    });

    const saved = await routeFor().$put(
      { param: paramFor(admin, project.id), json: body },
      { headers },
    );

    expect(saved.status).toBe(409);
    expect(await saved.json()).toMatchObject({ error: "content_sync_automation_overlap" });
  });

  it("answers a malformed connection id as a missing repository", async () => {
    const { admin, project, repository } = await seedWorkspace();
    await seedGitHubSync({
      organizationId: project.organizationId,
      projectId: project.id,
      repositoryId: repository.id,
    });
    const headers = await projectFixture.authHeadersFor(admin);

    const saved = await routeFor().$put(
      { param: paramFor(admin, project.id), json: syncBody("not-a-uuid") },
      { headers },
    );

    expect(saved.status).toBe(400);
    expect(await saved.json()).toMatchObject({ error: "content_sync_connection_required" });
  });

  describe("GitLab", () => {
    const access = {
      id: "33333333-3333-4333-8333-333333333333",
      accessToken: "glpat-test",
      baseUrl: "https://gitlab.example.test",
    };

    function gitlabProject(overrides: Partial<GitLabProject> = {}): GitLabProject {
      return {
        id: 42,
        name: "App",
        pathWithNamespace: "Acme/App",
        defaultBranch: "main",
        httpUrlToRepo: "https://gitlab.example.test/Acme/App.git",
        archived: false,
        accessLevel: 40,
        ...overrides,
      };
    }

    function gitlabBody(overrides: Record<string, unknown> = {}) {
      return {
        schedule: "manual" as const,
        syncConfig: {
          provider: "gitlab" as const,
          connectionId: "42",
          resourceKey: "acme/app",
          providerFolder: "locales",
          projectFolder: "gitlab/acme/app",
          branch: "release",
          pathTemplate: "{{locale}}.json",
          ...overrides,
        },
      };
    }

    it("lists the workspace server's projects and saves a GitLab sync", async () => {
      const { admin, project, repository } = await seedWorkspace();
      const headers = await projectFixture.authHeadersFor(admin);
      const param = paramFor(admin, project.id);
      loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(access));
      listGitLabMembershipProjectsMock.mockResolvedValue(
        ok([gitlabProject({ id: 7, pathWithNamespace: "acme/zeta" }), gitlabProject()]),
      );
      getGitLabProjectMock.mockResolvedValue(ok(gitlabProject()));

      const connections = await routeFor().connections.$get({ param, query: {} }, { headers });
      expect(await connections.json()).toEqual({
        connections: [
          {
            provider: "github",
            connectionId: repository.id,
            resourceKey: "acme/web",
            branch: "main",
          },
          {
            provider: "gitlab",
            connectionId: "42",
            resourceKey: "Acme/App",
            branch: "main",
            canSend: true,
            canRead: true,
          },
          {
            provider: "gitlab",
            connectionId: "7",
            resourceKey: "acme/zeta",
            branch: "main",
            canSend: true,
            canRead: true,
          },
        ],
        gitlab: { connected: true, available: true, connectionId: access.id, tokenCanSend: null },
        gitlabConnections: [],
      });

      const saved = await routeFor().$put({ param, json: gitlabBody() }, { headers });
      expect(saved.status).toBe(200);
      expect(
        ((await saved.json()) as { sync: { syncConfig: unknown } }).sync.syncConfig,
      ).toMatchObject({
        provider: "gitlab",
        connectionId: "42",
        // The server's own spelling of the path, which runs look up.
        resourceKey: "Acme/App",
        branch: "release",
        pathTemplate: "{{locale}}.json",
        // The connection the sync ran with is kept, so a later default change never moves it.
        gitlabConnectionId: access.id,
      });
      expect(getGitLabProjectMock).toHaveBeenCalledWith({
        ...access,
        pathWithNamespace: "acme/app",
      });

      // Only a sync that is already a GitHub one can be saved as one.
      const toGitHub = await routeFor().$put({ param, json: syncBody(repository.id) }, { headers });
      expect(toGitHub.status).toBe(400);
      expect(await toGitHub.json()).toMatchObject({ error: "content_sync_github_in_integrations" });
    });

    it("marks projects the connection can only read, says when the token is read-only, and refuses a project whose files it can't read", async () => {
      const { admin, project } = await seedWorkspace();
      const headers = await projectFixture.authHeadersFor(admin);
      const param = paramFor(admin, project.id);
      loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(access));
      getGitLabTokenAbilitiesMock.mockResolvedValue(
        ok({ scopes: ["read_api", "read_repository"], canSend: false, expiresAt: null }),
      );
      listGitLabMembershipProjectsMock.mockResolvedValue(
        ok([
          gitlabProject({ accessLevel: 20 }),
          gitlabProject({ id: 7, pathWithNamespace: "acme/zeta", accessLevel: null }),
        ]),
      );

      const connections = await routeFor().connections.$get({ param, query: {} }, { headers });
      expect(await connections.json()).toMatchObject({
        connections: [
          expect.anything(),
          { provider: "gitlab", connectionId: "42", canSend: false, canRead: true },
          { provider: "gitlab", connectionId: "7", canSend: null, canRead: null },
        ],
        gitlab: { tokenCanSend: false },
      });

      // Whether the files can be read is settled by reading them, not by the reported role: a
      // Guest sees a private project but not its tree.
      getGitLabProjectMock.mockResolvedValue(ok(gitlabProject({ accessLevel: 10 })));
      canReadGitLabRepositoryMock.mockResolvedValue(ok(false));
      const refused = await routeFor().$put({ param, json: gitlabBody() }, { headers });
      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ error: "content_sync_gitlab_access_too_low" });
      expect(canReadGitLabRepositoryMock).toHaveBeenCalledWith({ ...access, projectId: 42 });

      // A Guest on an internal project, or Developer through a shared group, reads fine.
      canReadGitLabRepositoryMock.mockResolvedValue(ok(true));
      const saved = await routeFor().$put({ param, json: gitlabBody() }, { headers });
      expect(saved.status).toBe(200);

      // A saved project whose role fell below Reporter is listed as having no access.
      listGitLabMembershipProjectsMock.mockResolvedValue(ok([]));
      const lowered = await routeFor().connections.$get({ param, query: {} }, { headers });
      expect(await lowered.json()).toMatchObject({
        connections: [expect.anything(), { connectionId: "42", canRead: false, canSend: false }],
      });
    });

    it("lists the projects of the connection asked for, and refuses one that isn't an id", async () => {
      const { admin, project } = await seedWorkspace();
      const headers = await projectFixture.authHeadersFor(admin);
      const param = paramFor(admin, project.id);
      loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(access));
      listGitLabMembershipProjectsMock.mockResolvedValue(ok([gitlabProject()]));

      const chosen = await routeFor().connections.$get(
        { param, query: { gitlabConnectionId: access.id } },
        { headers },
      );
      expect(chosen.status).toBe(200);
      expect(await chosen.json()).toMatchObject({
        gitlab: { connected: true, available: true, connectionId: access.id },
      });
      expect(loadGitLabConnectionCredentialsMock).toHaveBeenLastCalledWith({
        organizationId: project.organizationId,
        connectionId: access.id,
      });

      const malformed = await routeFor().connections.$get(
        { param, query: { gitlabConnectionId: "nope" } },
        { headers },
      );
      expect(malformed.status).toBe(400);

      // A saved project outside the listing is looked up only on the sync's own connection.
      getGitLabProjectMock.mockResolvedValue(ok(gitlabProject()));
      await routeFor().$put(
        { param, json: gitlabBody({ gitlabConnectionId: access.id }) },
        { headers },
      );
      listGitLabMembershipProjectsMock.mockResolvedValue(
        ok([gitlabProject({ id: 7, pathWithNamespace: "acme/zeta" })]),
      );
      getGitLabProjectMock.mockClear();
      const other = "44444444-4444-4444-8444-444444444444";
      await routeFor().connections.$get(
        { param, query: { gitlabConnectionId: other } },
        { headers },
      );
      expect(getGitLabProjectMock).not.toHaveBeenCalled();
      await routeFor().connections.$get(
        { param, query: { gitlabConnectionId: access.id } },
        { headers },
      );
      expect(getGitLabProjectMock).toHaveBeenCalledWith({
        ...access,
        pathWithNamespace: "Acme/App",
      });
    });

    it("says when the GitLab server's projects can't be listed", async () => {
      const { admin, project } = await seedWorkspace();
      const headers = await projectFixture.authHeadersFor(admin);
      loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(access));
      listGitLabMembershipProjectsMock.mockResolvedValue(
        err({ code: "gitlab_request_failed", message: "down", status: 502 }),
      );

      const connections = await routeFor().connections.$get(
        { param: paramFor(admin, project.id), query: {} },
        { headers },
      );
      expect(await connections.json()).toMatchObject({
        gitlab: { connected: true, available: false },
      });
    });

    it("refuses a GitLab sync the workspace server can't confirm", async () => {
      const { admin, project } = await seedWorkspace();
      const headers = await projectFixture.authHeadersFor(admin);
      const param = paramFor(admin, project.id);
      const save = async (body = gitlabBody()) => {
        const response = await routeFor().$put({ param, json: body }, { headers });
        expect(response.status).toBe(400);
        return ((await response.json()) as { error: string }).error;
      };

      expect(await save(gitlabBody({ pathTemplate: undefined }))).toBe(
        "content_sync_path_template_required",
      );
      expect(await save(gitlabBody({ pathTemplate: "messages.json" }))).toBe(
        "content_sync_path_template_invalid",
      );

      expect(await save()).toBe("content_sync_gitlab_not_connected");

      loadGitLabConnectionCredentialsMock.mockResolvedValue(
        err({ code: "gitlab_connection_decrypt_failed", message: "unreadable" }),
      );
      expect(await save()).toBe("content_sync_gitlab_token_unreadable");

      loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(access));
      getGitLabProjectMock.mockResolvedValue(err({ code: "gitlab_not_found", message: "gone" }));
      expect(await save()).toBe("content_sync_gitlab_project_not_found");

      getGitLabProjectMock.mockResolvedValue(
        err({ code: "gitlab_request_failed", message: "down", status: 502 }),
      );
      expect(await save()).toBe("content_sync_gitlab_unavailable");

      // A chosen connection that no longer exists is reported, never swapped for the default.
      loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(null));
      expect(await save(gitlabBody({ gitlabConnectionId: access.id }))).toBe(
        "content_sync_gitlab_connection_removed",
      );
      expect(loadGitLabConnectionCredentialsMock).toHaveBeenLastCalledWith({
        organizationId: project.organizationId,
        connectionId: access.id,
      });
      loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(access));

      // Another project now sits at the saved path, for example on a replaced server.
      getGitLabProjectMock.mockResolvedValue(ok(gitlabProject({ id: 99 })));
      expect(await save()).toBe("content_sync_gitlab_project_not_found");

      getGitLabProjectMock.mockResolvedValue(ok(gitlabProject({ archived: true })));
      expect(await save()).toBe("content_sync_gitlab_project_not_found");
    });

    it("shows unmatched files, the keys a run hid or found clashing, and source files sent", async () => {
      const { admin, project } = await seedWorkspace();
      const headers = await projectFixture.authHeadersFor(admin);
      const param = paramFor(admin, project.id);
      loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(access));
      getGitLabProjectMock.mockResolvedValue(ok(gitlabProject()));
      const saved = await routeFor().$put({ param, json: gitlabBody() }, { headers });
      const { sync } = (await saved.json()) as { sync: { id: string } };
      const manyKeys = Array.from({ length: 25 }, (_, index) => `key.${index}`);
      await db.insert(schema.projectContentSyncRuns).values({
        syncId: sync.id,
        organizationId: project.organizationId,
        projectId: project.id,
        trigger: "manual",
        status: "succeeded",
        summary: {
          pulled: {
            uploaded: 1,
            skipped: 0,
            failed: 0,
            unmatched: 3,
            translationFiles: 1,
            commitSha: "abc",
            files: [
              { path: "gitlab/acme/app/en.json", clashes: ["home.title"], missingKeys: manyKeys },
              { path: "gitlab/acme/app/empty.json", missingKeys: [] },
            ],
          },
          pushed: { written: 0, sourceWritten: 1, pullRequestUrl: null },
        },
        completedAt: new Date(),
      });

      const listed = await routeFor().$get({ param }, { headers });
      const body = (await listed.json()) as {
        contentSync: { runs: Array<Record<string, unknown>> };
      };
      expect(body.contentSync.runs[0]).toMatchObject({
        pulled: { uploaded: 1, skipped: 0, failed: 0, unmatched: 3 },
        hiddenKeys: [
          { path: "gitlab/acme/app/en.json", keys: manyKeys.slice(0, 20), keyCount: 25 },
        ],
        clashes: [{ path: "gitlab/acme/app/en.json", keys: ["home.title"], keyCount: 1 }],
        sourceWritten: 1,
        pullRequestUrl: null,
      });
    });
  });
});
