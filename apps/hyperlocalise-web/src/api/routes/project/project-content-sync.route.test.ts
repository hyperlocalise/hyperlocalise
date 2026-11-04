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

const { enqueueActivityLogEventMock, resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  enqueueActivityLogEventMock: vi.fn(async () => ({ ok: true as const, value: {} })),
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

vi.mock("@/lib/activity-log/activity-log-writer", () => ({
  enqueueActivityLogEvent: enqueueActivityLogEventMock,
  enqueueActivityLogEvents: vi.fn(async () => []),
}));

import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { contentSyncFingerprintFromConfig } from "@/lib/agents/content-sync/content-sync-config";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

import { createProjectTestFixture } from "./project.fixture";

const enqueue = vi.fn(async () => ({ ids: ["queued"] }));
const client = testClient<AppType>(createApp({ projectContentSyncQueue: { enqueue } }));
const projectFixture = createProjectTestFixture(client);

beforeAll(async () => {
  await db.$client.query("select 1");
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

    const connections = await routeFor().connections.$get({ param }, { headers });
    expect(await connections.json()).toEqual({
      connections: [{ provider: "github", connectionId: repository.id, resourceKey: "acme/web" }],
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
    const adminHeaders = await projectFixture.authHeadersFor(admin);
    await routeFor().$put(
      { param: paramFor(admin, project.id), json: syncBody(repository.id) },
      { headers: adminHeaders },
    );

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
    const connections = await routeFor().connections.$get({ param }, { headers: memberHeaders });
    expect(connections.status).toBe(403);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("refuses another workspace's repository, a disabled one and other providers", async () => {
    const { admin, project, repository } = await seedWorkspace();
    const other = await seedWorkspace();
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

    const gitlab = await routeFor().$put(
      {
        param,
        json: {
          ...syncBody(repository.id),
          syncConfig: { ...syncBody(repository.id).syncConfig, provider: "gitlab" },
        },
      },
      { headers },
    );
    expect(gitlab.status).toBe(400);
    expect(await gitlab.json()).toMatchObject({ error: "content_sync_provider_not_ready" });

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
    const { admin, project } = await seedWorkspace();
    const headers = await projectFixture.authHeadersFor(admin);

    const saved = await routeFor().$put(
      { param: paramFor(admin, project.id), json: syncBody("not-a-uuid") },
      { headers },
    );

    expect(saved.status).toBe(400);
    expect(await saved.json()).toMatchObject({ error: "content_sync_connection_required" });
  });
});
