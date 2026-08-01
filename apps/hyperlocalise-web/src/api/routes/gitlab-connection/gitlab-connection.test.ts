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

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { syncGitlabConnectionProjectsMock } = vi.hoisted(() => ({
  syncGitlabConnectionProjectsMock: vi.fn(),
}));

vi.mock("@/lib/agents/gitlab/projects", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/agents/gitlab/projects")>();
  return {
    ...original,
    syncGitlabConnectionProjects: syncGitlabConnectionProjectsMock,
  };
});

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

import { createApp } from "@/api/app";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { buildEncryptedGitlabTokenFields } from "@/lib/agents/gitlab/tokens";
import { verifyGitlabState } from "@/lib/agents/gitlab/oauth-state";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { ok } from "@/lib/primitives/result/results";

const client = testClient(createApp());
const fixture = createProjectTestFixture(client);

async function createConnectionFixture(role: "admin" | "member" = "admin") {
  const identity = fixture.createWorkosIdentityWithRole(role);
  const headers = await fixture.authHeadersFor(identity);
  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("missing auth context");
  }

  const encrypted = buildEncryptedGitlabTokenFields({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    scope: "read_api read_repository read_user",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });

  const [connection] = await db
    .insert(schema.gitlabConnections)
    .values({
      organizationId: auth.organization.localOrganizationId,
      baseUrl: "https://gitlab.com",
      gitlabUserId: "42",
      username: "hyperlocalise",
      displayName: "Hyperlocalise",
      ...encrypted,
    })
    .returning();

  if (!connection) {
    throw new Error("failed to create gitlab connection fixture");
  }

  await db.insert(schema.gitlabProjects).values([
    {
      organizationId: auth.organization.localOrganizationId,
      gitlabConnectionId: connection.id,
      gitlabProjectId: "101",
      name: "hyperlocalise",
      pathWithNamespace: "hyperlocalise/hyperlocalise",
      httpUrlToRepo: "https://gitlab.com/hyperlocalise/hyperlocalise.git",
      private: false,
      archived: false,
      defaultBranch: "main",
      enabled: true,
    },
    {
      organizationId: auth.organization.localOrganizationId,
      gitlabConnectionId: connection.id,
      gitlabProjectId: "102",
      name: "docs",
      pathWithNamespace: "hyperlocalise/docs",
      httpUrlToRepo: "https://gitlab.com/hyperlocalise/docs.git",
      private: true,
      archived: false,
      defaultBranch: "main",
      enabled: false,
    },
  ]);

  return {
    auth,
    headers,
    connection,
    organizationSlug: identity.organization.slug ?? "missing-slug",
  };
}

describe("gitlabConnectionRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    syncGitlabConnectionProjectsMock.mockReset();
    syncGitlabConnectionProjectsMock.mockResolvedValue(ok([]));
    await fixture.cleanup();
  });

  it("returns connection metadata with project counts", async () => {
    const { headers, organizationSlug } = await createConnectionFixture();

    const response = await client.api.orgs[":organizationSlug"]["gitlab-connection"].$get(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      connection: {
        username: "hyperlocalise",
        projectCount: 2,
        enabledProjectCount: 1,
      },
    });
  });

  it("lists and searches synced projects", async () => {
    const { headers, organizationSlug } = await createConnectionFixture();

    const response = await client.api.orgs[":organizationSlug"]["gitlab-connection"].projects.$get(
      {
        param: { organizationSlug },
        query: { q: "docs" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      projects: Array<{ pathWithNamespace: string; private: boolean; enabled: boolean }>;
    };
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({
      pathWithNamespace: "hyperlocalise/docs",
      private: true,
      enabled: false,
    });
  });

  it("forbids members from minting install urls", async () => {
    const { headers, organizationSlug } = await createConnectionFixture("member");

    const response = await client.api.orgs[":organizationSlug"]["gitlab-connection"][
      "install-url"
    ].$get({ param: { organizationSlug } }, { headers });

    expect(response.status).toBe(403);
  });

  it("mints a signed install url and persists oauth state", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const auth = globalThis.__testApiAuthContext!;

    const response = await client.api.orgs[":organizationSlug"]["gitlab-connection"][
      "install-url"
    ].$get({ param: { organizationSlug } }, { headers });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    expect(body.url).toContain("https://gitlab.com/oauth/authorize");
    expect(body.url).toContain("client_id=");
    expect(body.url).toContain("read_repository");

    const url = new URL(body.url);
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    const verified = await verifyGitlabState(state!, env.GITLAB_OAUTH_STATE_SECRET!);
    expect(verified?.slug).toBe(organizationSlug);

    const [stateRow] = await db
      .select()
      .from(schema.gitlabConnectionStates)
      .where(eq(schema.gitlabConnectionStates.nonce, verified!.nonce))
      .limit(1);
    expect(stateRow?.organizationId).toBe(auth.organization.localOrganizationId);
  });

  it("allows admins to update enabled projects", async () => {
    const { auth, headers, organizationSlug } = await createConnectionFixture("admin");

    const response = await client.api.orgs[":organizationSlug"][
      "gitlab-connection"
    ].projects.$patch(
      {
        param: { organizationSlug },
        json: { enabledProjectIds: ["102"] },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const projects = await db
      .select()
      .from(schema.gitlabProjects)
      .where(eq(schema.gitlabProjects.organizationId, auth.organization.localOrganizationId));
    expect(projects.find((project) => project.gitlabProjectId === "101")?.enabled).toBe(false);
    expect(projects.find((project) => project.gitlabProjectId === "102")?.enabled).toBe(true);
  });

  it("syncs projects for operators", async () => {
    const { headers, organizationSlug, connection, auth } = await createConnectionFixture();
    syncGitlabConnectionProjectsMock.mockResolvedValueOnce(ok([{ id: "101" }]));

    const response = await client.api.orgs[":organizationSlug"][
      "gitlab-connection"
    ].projects.sync.$post({ param: { organizationSlug } }, { headers });

    expect(response.status).toBe(200);
    expect(syncGitlabConnectionProjectsMock).toHaveBeenCalledWith({
      organizationId: auth.organization.localOrganizationId,
      gitlabConnectionId: connection.id,
    });
    await expect(response.json()).resolves.toMatchObject({
      sync: { syncedProjectCount: 1 },
    });
  });

  it("disconnects a connection", async () => {
    const { headers, organizationSlug, auth } = await createConnectionFixture();

    const response = await client.api.orgs[":organizationSlug"]["gitlab-connection"].$delete(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(204);

    const remaining = await db
      .select()
      .from(schema.gitlabConnections)
      .where(eq(schema.gitlabConnections.organizationId, auth.organization.localOrganizationId));
    expect(remaining).toHaveLength(0);
  });
});
