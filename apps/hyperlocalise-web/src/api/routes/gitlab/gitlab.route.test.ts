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

import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  listAccessibleGitLabProjects: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/gitlab/repository-context", () => ({
  listAccessibleGitLabProjects: (...args: unknown[]) => mocks.listAccessibleGitLabProjects(...args),
}));

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

describe("gitlabRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.listAccessibleGitLabProjects.mockReset();
    mocks.listAccessibleGitLabProjects.mockResolvedValue({
      projects: [
        {
          id: 11,
          name: "web",
          pathWithNamespace: "acme/platform/web",
          defaultBranch: "main",
          httpUrlToRepo: "https://gitlab.com/acme/platform/web.git",
          archived: false,
        },
      ],
      error: null,
    });
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("lists membership projects for the connected GitLab account", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].gitlab.projects.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      projects: [
        {
          id: 11,
          name: "web",
          pathWithNamespace: "acme/platform/web",
          defaultBranch: "main",
          httpUrlToRepo: "https://gitlab.com/acme/platform/web.git",
          archived: false,
        },
      ],
    });
    expect(mocks.listAccessibleGitLabProjects).toHaveBeenCalledWith({
      localOrganizationId: expect.any(String),
      workosUserId: identity.user.workosUserId,
    });
  });

  it("returns an empty list when GitLab is not connected", async () => {
    mocks.listAccessibleGitLabProjects.mockResolvedValue({
      projects: [],
      error: { code: "gitlab_not_connected", message: "Connect GitLab" },
    });
    const identity = fixture.createWorkosIdentityWithRole("developer");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].gitlab.projects.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ projects: [] });
  });

  it("returns 503 when WorkOS Pipes is unavailable", async () => {
    mocks.listAccessibleGitLabProjects.mockResolvedValue({
      projects: [],
      error: {
        code: "gitlab_pipes_unavailable",
        message: "WorkOS is not configured, so GitLab cannot connect through Pipes.",
      },
    });
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].gitlab.projects.$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "" },
      },
      { headers },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "gitlab_pipes_unavailable",
    });
  });
});
