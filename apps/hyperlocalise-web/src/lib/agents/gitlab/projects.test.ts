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
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { buildEncryptedGitlabTokenFields } from "@/lib/agents/gitlab/tokens";
import { db, schema } from "@/lib/database";
import { ok } from "@/lib/primitives/result/results";

const { listGitlabMembershipProjectsMock, getGitlabAccessTokenMock } = vi.hoisted(() => ({
  listGitlabMembershipProjectsMock: vi.fn(),
  getGitlabAccessTokenMock: vi.fn(),
}));

vi.mock("@/lib/agents/gitlab/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/agents/gitlab/api")>();
  return {
    ...original,
    listGitlabMembershipProjects: listGitlabMembershipProjectsMock,
  };
});

vi.mock("@/lib/agents/gitlab/tokens", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/agents/gitlab/tokens")>();
  return {
    ...original,
    getGitlabAccessToken: getGitlabAccessTokenMock,
  };
});

import { syncGitlabConnectionProjects } from "./projects";

const fixture = createProjectTestFixture();

describe("syncGitlabConnectionProjects", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("reconciles upserts and stale deletes atomically and preserves enablement", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);
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
      throw new Error("failed to create gitlab connection");
    }

    await db.insert(schema.gitlabProjects).values([
      {
        organizationId: auth.organization.localOrganizationId,
        gitlabConnectionId: connection.id,
        gitlabProjectId: "101",
        name: "keep-me",
        pathWithNamespace: "hyperlocalise/keep-me",
        httpUrlToRepo: "https://gitlab.com/hyperlocalise/keep-me.git",
        private: false,
        archived: false,
        defaultBranch: "main",
        enabled: true,
      },
      {
        organizationId: auth.organization.localOrganizationId,
        gitlabConnectionId: connection.id,
        gitlabProjectId: "999",
        name: "stale",
        pathWithNamespace: "hyperlocalise/stale",
        httpUrlToRepo: "https://gitlab.com/hyperlocalise/stale.git",
        private: false,
        archived: false,
        defaultBranch: "main",
        enabled: true,
      },
    ]);

    getGitlabAccessTokenMock.mockResolvedValueOnce(
      ok({
        accessToken: "access-token",
        baseUrl: "https://gitlab.com",
        connectionId: connection.id,
      }),
    );
    listGitlabMembershipProjectsMock.mockResolvedValueOnce(
      ok([
        {
          id: 101,
          name: "keep-me-renamed",
          path_with_namespace: "hyperlocalise/keep-me",
          http_url_to_repo: "https://gitlab.com/hyperlocalise/keep-me.git",
          visibility: "private",
          archived: false,
          default_branch: "main",
        },
        {
          id: 202,
          name: "fresh",
          path_with_namespace: "hyperlocalise/fresh",
          http_url_to_repo: "https://gitlab.com/hyperlocalise/fresh.git",
          visibility: "public",
          archived: false,
          default_branch: "develop",
        },
      ]),
    );

    const transactionSpy = vi.spyOn(db, "transaction");

    const result = await syncGitlabConnectionProjects({
      organizationId: auth.organization.localOrganizationId,
      gitlabConnectionId: connection.id,
    });

    expect(result.ok).toBe(true);
    expect(transactionSpy).toHaveBeenCalled();

    const projects = await db
      .select()
      .from(schema.gitlabProjects)
      .where(eq(schema.gitlabProjects.gitlabConnectionId, connection.id));

    expect(projects).toHaveLength(2);
    expect(projects.find((project) => project.gitlabProjectId === "999")).toBeUndefined();
    expect(projects.find((project) => project.gitlabProjectId === "101")).toMatchObject({
      name: "keep-me-renamed",
      private: true,
      enabled: true,
    });
    expect(projects.find((project) => project.gitlabProjectId === "202")).toMatchObject({
      name: "fresh",
      enabled: false,
      defaultBranch: "develop",
    });

    transactionSpy.mockRestore();
  });
});
