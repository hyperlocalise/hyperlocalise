import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { syncInstallationRepositoriesMock } = vi.hoisted(() => ({
  syncInstallationRepositoriesMock: vi.fn(async () => []),
}));
const { deleteInstallationMock } = vi.hoisted(() => ({
  deleteInstallationMock: vi.fn(async () => ({ status: 204 })),
}));
const { i18nSetupEnqueueMock } = vi.hoisted(() => ({
  i18nSetupEnqueueMock: vi.fn(async () => ({ ids: ["workflow-run-test"] })),
}));

vi.mock("@/lib/agents/github/repositories", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/agents/github/repositories")>();
  return {
    ...original,
    syncInstallationRepositories: syncInstallationRepositoriesMock,
  };
});
vi.mock("@/lib/agents/github/app", () => ({
  getGitHubApp: () => ({
    octokit: {
      request: deleteInstallationMock,
    },
  }),
}));

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
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { verifyGitHubState } from "@/lib/agents/github/oauth-state";

const client = testClient(
  createApp({
    i18nSetupQueue: {
      enqueue: i18nSetupEnqueueMock,
    },
  }),
);
const fixture = createProjectTestFixture(client);

async function createInstallationFixture(role: "owner" | "admin" | "member" = "owner") {
  const identity = fixture.createWorkosIdentityWithRole(role);
  const headers = await fixture.authHeadersFor(identity);
  const auth = globalThis.__testApiAuthContext;
  if (!auth) {
    throw new Error("missing auth context");
  }

  await db.insert(schema.githubInstallations).values({
    organizationId: auth.organization.localOrganizationId,
    githubInstallationId: "987654",
    githubAppId: "123",
    accountLogin: "hyperlocalise",
    accountType: "Organization",
  });

  await db.insert(schema.githubInstallationRepositories).values([
    {
      organizationId: auth.organization.localOrganizationId,
      githubInstallationId: "987654",
      githubRepositoryId: "101",
      owner: "hyperlocalise",
      name: "hyperlocalise",
      fullName: "hyperlocalise/hyperlocalise",
      private: false,
      archived: false,
      defaultBranch: "main",
      enabled: true,
    },
    {
      organizationId: auth.organization.localOrganizationId,
      githubInstallationId: "987654",
      githubRepositoryId: "102",
      owner: "hyperlocalise",
      name: "demo-repository",
      fullName: "hyperlocalise/demo-repository",
      private: true,
      archived: false,
      defaultBranch: "main",
      enabled: false,
    },
  ]);

  return { auth, headers, organizationSlug: identity.organization.slug ?? "missing-slug" };
}

describe("githubInstallationRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("returns installation metadata with repository counts", async () => {
    const { headers, organizationSlug } = await createInstallationFixture();

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].$get(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      installation: {
        accountLogin: "hyperlocalise",
        repositoryCount: 2,
        enabledRepositoryCount: 1,
      },
    });
  });

  it("lists and searches synced repositories", async () => {
    const { headers, organizationSlug } = await createInstallationFixture();

    const response = await client.api.orgs[":organizationSlug"]["github-installation"][
      "repositories"
    ].$get(
      {
        param: { organizationSlug },
        query: { q: "demo" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.repositories).toHaveLength(1);
    expect(body.repositories[0]).toMatchObject({
      fullName: "hyperlocalise/demo-repository",
      private: true,
      enabled: false,
    });
  });

  it("allows admins to update enabled repositories", async () => {
    const { auth, headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"][
      "repositories"
    ].$patch(
      {
        param: { organizationSlug },
        json: { enabledRepositoryIds: ["102"] },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const repositories = await db
      .select()
      .from(schema.githubInstallationRepositories)
      .where(
        eq(
          schema.githubInstallationRepositories.organizationId,
          auth.organization.localOrganizationId,
        ),
      );
    expect(
      repositories.find((repository) => repository.githubRepositoryId === "101")?.enabled,
    ).toBe(false);
    expect(
      repositories.find((repository) => repository.githubRepositoryId === "102")?.enabled,
    ).toBe(true);
  });

  it("blocks members from updating enabled repositories", async () => {
    const { headers, organizationSlug } = await createInstallationFixture("member");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"][
      "repositories"
    ].$patch(
      {
        param: { organizationSlug },
        json: { enabledRepositoryIds: ["102"] },
      },
      { headers },
    );

    expect(response.status).toBe(403);
  });

  it("creates an install URL with a persisted user-bound state", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const auth = globalThis.__testApiAuthContext;
    if (!auth) {
      throw new Error("missing auth context");
    }
    const organizationSlug = identity.organization.slug ?? "missing-slug";

    const response = await client.api.orgs[":organizationSlug"]["github-installation"][
      "install-url"
    ].$get({ param: { organizationSlug } }, { headers });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    const url = new URL(body.url);
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    const verified = await verifyGitHubState(state ?? "", env.GITHUB_OAUTH_STATE_SECRET ?? "");
    expect(verified).toMatchObject({ slug: organizationSlug });

    const states = await db
      .select()
      .from(schema.githubInstallationStates)
      .where(
        eq(schema.githubInstallationStates.organizationId, auth.organization.localOrganizationId),
      );
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      nonce: verified?.nonce,
      userId: auth.user.localUserId,
      consumedAt: null,
    });
  });

  it("allows admins to trigger repository sync", async () => {
    syncInstallationRepositoriesMock.mockResolvedValueOnce([
      {
        id: 103,
        owner: "hyperlocalise",
        name: "synced",
        fullName: "hyperlocalise/synced",
        private: false,
        archived: false,
        defaultBranch: "main",
      },
    ] as never);
    const { headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"][
      "repositories"
    ].sync.$post({ param: { organizationSlug } }, { headers });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ syncedRepositoryCount: 1 });
    expect(syncInstallationRepositoriesMock).toHaveBeenCalledWith({
      organizationId: globalThis.__testApiAuthContext?.organization.localOrganizationId,
      githubInstallationId: "987654",
    });
  });

  it("revokes the GitHub App installation and removes local state", async () => {
    const { auth, headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].$delete(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(204);
    expect(deleteInstallationMock).toHaveBeenCalledWith(
      "DELETE /app/installations/{installation_id}",
      {
        installation_id: 987654,
      },
    );

    const [installation] = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, auth.organization.localOrganizationId));
    expect(installation).toBeUndefined();
  });

  it("cleans up local state when GitHub installation is already removed", async () => {
    deleteInstallationMock.mockRejectedValueOnce({ status: 404 });
    const { auth, headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].$delete(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(204);

    const [installation] = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, auth.organization.localOrganizationId));
    expect(installation).toBeUndefined();
  });

  it("cleans up local state when GitHub returns 410 Gone", async () => {
    deleteInstallationMock.mockRejectedValueOnce({ status: 410 });
    const { auth, headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].$delete(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(204);

    const [installation] = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, auth.organization.localOrganizationId));
    expect(installation).toBeUndefined();
  });

  it("does not remove local state when remote revocation fails", async () => {
    deleteInstallationMock.mockRejectedValueOnce({ status: 500 });
    const { auth, headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].$delete(
      { param: { organizationSlug } },
      { headers },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "github_installation_revoke_failed",
    });

    const [installation] = await db
      .select()
      .from(schema.githubInstallations)
      .where(eq(schema.githubInstallations.organizationId, auth.organization.localOrganizationId));
    expect(installation).toBeDefined();
  });

  it("starts i18n setup for an enabled repository", async () => {
    const { headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].repositories[
      ":githubRepositoryId"
    ]["i18n-setup"].$post(
      {
        param: { organizationSlug, githubRepositoryId: "101" },
      },
      { headers },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      i18nSetupRun: {
        githubRepositoryId: "101",
        status: "queued",
        repositoryFullName: "hyperlocalise/hyperlocalise",
      },
    });
    expect(i18nSetupEnqueueMock).toHaveBeenCalledTimes(1);
  });

  it("rejects i18n setup for disabled repositories", async () => {
    const { headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].repositories[
      ":githubRepositoryId"
    ]["i18n-setup"].$post(
      {
        param: { organizationSlug, githubRepositoryId: "102" },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "github_repository_not_enabled",
    });
    expect(i18nSetupEnqueueMock).not.toHaveBeenCalled();
  });

  it("blocks members from reading i18n setup runs", async () => {
    const { auth, headers, organizationSlug } = await createInstallationFixture("member");

    const [run] = await db
      .insert(schema.githubI18nSetupRuns)
      .values({
        organizationId: auth.organization.localOrganizationId,
        actorUserId: auth.user.localUserId,
        githubInstallationId: "987654",
        githubRepositoryId: "101",
        repositoryFullName: "hyperlocalise/hyperlocalise",
        baseBranch: "main",
        status: "failed",
      })
      .returning();

    const latestResponse = await client.api.orgs[":organizationSlug"][
      "github-installation"
    ].repositories[":githubRepositoryId"]["i18n-setup-runs"].latest.$get(
      {
        param: { organizationSlug, githubRepositoryId: "101" },
      },
      { headers },
    );

    expect(latestResponse.status).toBe(403);

    const runResponse = await client.api.orgs[":organizationSlug"]["github-installation"][
      "i18n-setup-runs"
    ][":runId"].$get(
      {
        param: { organizationSlug, runId: run.id },
      },
      { headers },
    );

    expect(runResponse.status).toBe(403);
  });

  it("returns default automation settings for a repository", async () => {
    const { headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].repositories[
      ":githubRepositoryId"
    ]["automation-settings"].$get(
      {
        param: { organizationSlug, githubRepositoryId: "101" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      githubRepositoryAutomationSettings: {
        githubRepositoryId: "101",
        configVersion: 0,
        nextRunAt: null,
        settings: {
          workflows: {
            pushSource: { enabled: false },
            pullTranslations: { enabled: false },
            validation: { enabled: false },
          },
          trigger: null,
          statusCheck: { enabled: false, mode: "blocking" },
        },
      },
    });
  });

  it("saves automation settings per repository without affecting other repos", async () => {
    const { headers, organizationSlug } = await createInstallationFixture("admin");

    const saveResponse = await client.api.orgs[":organizationSlug"][
      "github-installation"
    ].repositories[":githubRepositoryId"]["automation-settings"].$put(
      {
        param: { organizationSlug, githubRepositoryId: "101" },
        json: {
          settings: {
            workflows: {
              pushSource: { enabled: true },
              pullTranslations: { enabled: false },
              validation: { enabled: false },
            },
            statusCheck: { enabled: true, mode: "blocking" },
            trigger: {
              mode: "push",
              branches: ["main", "release/*"],
            },
          },
        },
      },
      { headers },
    );

    expect(saveResponse.status).toBe(200);
    await expect(saveResponse.json()).resolves.toMatchObject({
      githubRepositoryAutomationSettings: {
        githubRepositoryId: "101",
        configVersion: 1,
        settings: {
          workflows: {
            pushSource: { enabled: true },
          },
          statusCheck: { enabled: true, mode: "blocking" },
          trigger: {
            mode: "push",
            branches: ["main", "release/*"],
          },
        },
      },
    });

    const otherRepoResponse = await client.api.orgs[":organizationSlug"][
      "github-installation"
    ].repositories[":githubRepositoryId"]["automation-settings"].$get(
      {
        param: { organizationSlug, githubRepositoryId: "102" },
      },
      { headers },
    );

    expect(otherRepoResponse.status).toBe(200);
    await expect(otherRepoResponse.json()).resolves.toMatchObject({
      githubRepositoryAutomationSettings: {
        githubRepositoryId: "102",
        configVersion: 0,
        settings: {
          trigger: null,
        },
      },
    });
  });

  it("rejects unusable automation settings without a trigger", async () => {
    const { headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].repositories[
      ":githubRepositoryId"
    ]["automation-settings"].$put(
      {
        param: { organizationSlug, githubRepositoryId: "101" },
        json: {
          settings: {
            workflows: {
              validation: { enabled: true },
            },
          },
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "automation_trigger_required",
    });
  });

  it("stores scheduled automation with next run metadata", async () => {
    const { headers, organizationSlug } = await createInstallationFixture("admin");

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].repositories[
      ":githubRepositoryId"
    ]["automation-settings"].$put(
      {
        param: { organizationSlug, githubRepositoryId: "101" },
        json: {
          settings: {
            workflows: {
              pullTranslations: { enabled: true },
            },
            trigger: {
              mode: "scheduled",
              cadence: "daily",
              hourUtc: 4,
              timezone: "UTC",
            },
          },
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      githubRepositoryAutomationSettings: {
        settings: {
          trigger: {
            mode: "scheduled",
            cadence: "daily",
            hourUtc: 4,
            timezone: "UTC",
          },
        },
        nextRunAt: expect.any(String),
      },
    });
  });

  it("returns the latest i18n setup run for a repository", async () => {
    const { auth, headers, organizationSlug } = await createInstallationFixture("admin");

    await db.insert(schema.githubI18nSetupRuns).values({
      organizationId: auth.organization.localOrganizationId,
      actorUserId: auth.user.localUserId,
      githubInstallationId: "987654",
      githubRepositoryId: "101",
      repositoryFullName: "hyperlocalise/hyperlocalise",
      baseBranch: "main",
      status: "failed",
      errorCode: "locale_files_not_found",
      errorMessage: "Could not find locale translation files in this repository.",
    });

    const response = await client.api.orgs[":organizationSlug"]["github-installation"].repositories[
      ":githubRepositoryId"
    ]["i18n-setup-runs"].latest.$get(
      {
        param: { organizationSlug, githubRepositoryId: "101" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      i18nSetupRun: {
        githubRepositoryId: "101",
        status: "failed",
        errorCode: "locale_files_not_found",
      },
    });
  });
});
