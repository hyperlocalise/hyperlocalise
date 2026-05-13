import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { syncInstallationRepositoriesMock } = vi.hoisted(() => ({
  syncInstallationRepositoriesMock: vi.fn(async () => []),
}));

vi.mock("@/lib/agents/github/repositories", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/agents/github/repositories")>();
  return {
    ...original,
    syncInstallationRepositories: syncInstallationRepositoriesMock,
  };
});

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

import { app } from "@/api/app";
import { ensureGithubRepositoryTables } from "@/api/routes/github-test-fixture";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";

const client = testClient(app);
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
    await ensureGithubRepositoryTables();
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
});
