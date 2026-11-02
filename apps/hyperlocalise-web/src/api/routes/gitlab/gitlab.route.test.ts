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
  withPublicHttpFetch: vi.fn(),
  assertProviderUrlResolvable: vi.fn(),
}));

vi.mock("@/lib/security/public-http-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/public-http-fetch")>()),
  withPublicHttpFetch: mocks.withPublicHttpFetch,
}));

vi.mock("@/lib/providers/shared/provider-url-resolve", () => ({
  assertProviderUrlResolvable: mocks.assertProviderUrlResolvable,
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

  describe("connection", () => {
    const serverUrl = "https://git.acme.example/";

    it("hides the connection from people who can't read integrations", async () => {
      const identity = fixture.createWorkosIdentityWithRole("member");
      const headers = await fixture.authHeadersFor(identity);

      const read = await client.api.orgs[":organizationSlug"].gitlab.connection.$get(
        { param: { organizationSlug: identity.organization.slug ?? "missing-slug" } },
        { headers },
      );

      expect(read.status).toBe(403);
    });

    function mockGitLabServer() {
      mocks.withPublicHttpFetch.mockImplementation(
        async (url: string, _init: unknown, handler: (response: Response) => unknown) =>
          handler(
            Response.json(url.includes("/api/v4/user") ? { username: "translations-bot" } : []),
          ),
      );
    }

    beforeEach(() => {
      mocks.withPublicHttpFetch.mockReset();
      mocks.assertProviderUrlResolvable.mockReset();
    });

    it("saves, reads and removes a connection without returning the token", async () => {
      mockGitLabServer();
      const identity = fixture.createWorkosIdentityWithRole("admin");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };
      const connection = client.api.orgs[":organizationSlug"].gitlab.connection;

      const saved = await connection.$put(
        { param, json: { serverUrl, accessToken: "glpat-secret-abcd" } },
        { headers },
      );
      expect(saved.status).toBe(200);

      const read = await connection.$get({ param }, { headers });
      const body = await read.text();
      expect(JSON.parse(body)).toMatchObject({
        gitlabConnection: {
          serverUrl: "https://git.acme.example",
          connectedUsername: "translations-bot",
        },
      });
      expect(body).not.toContain("glpat-secret");

      const removed = await connection.$delete({ param }, { headers });
      expect(removed.status).toBe(200);
      const after = await connection.$get({ param }, { headers });
      expect(await after.json()).toEqual({ gitlabConnection: null });
    });

    it("explains a rejected token and saves nothing", async () => {
      mocks.withPublicHttpFetch.mockImplementation(
        async (_url: string, _init: unknown, handler: (response: Response) => unknown) =>
          handler(new Response("{}", { status: 401 })),
      );
      const identity = fixture.createWorkosIdentityWithRole("admin");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };
      const connection = client.api.orgs[":organizationSlug"].gitlab.connection;

      const saved = await connection.$put(
        { param, json: { serverUrl, accessToken: "glpat-bad" } },
        { headers },
      );

      expect(saved.status).toBe(400);
      expect(await saved.json()).toMatchObject({ error: "gitlab_token_rejected" });
      const read = await connection.$get({ param }, { headers });
      expect(await read.json()).toEqual({ gitlabConnection: null });
    });

    it("refuses a private address without contacting it", async () => {
      const identity = fixture.createWorkosIdentityWithRole("admin");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };

      const saved = await client.api.orgs[":organizationSlug"].gitlab.connection.$put(
        { param, json: { serverUrl: "https://10.0.0.5", accessToken: "glpat-secret" } },
        { headers },
      );

      expect(saved.status).toBe(400);
      expect(await saved.json()).toMatchObject({ error: "gitlab_server_url_invalid" });
      expect(mocks.withPublicHttpFetch).not.toHaveBeenCalled();
    });

    it("lets developers read the connection but not change it", async () => {
      const identity = fixture.createWorkosIdentityWithRole("developer");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };
      const connection = client.api.orgs[":organizationSlug"].gitlab.connection;

      const saved = await connection.$put(
        { param, json: { serverUrl, accessToken: "glpat-secret" } },
        { headers },
      );
      const removed = await connection.$delete({ param }, { headers });

      const read = await connection.$get({ param }, { headers });

      expect(read.status).toBe(200);
      expect(saved.status).toBe(403);
      expect(removed.status).toBe(403);
      expect(mocks.withPublicHttpFetch).not.toHaveBeenCalled();
    });
  });
});
