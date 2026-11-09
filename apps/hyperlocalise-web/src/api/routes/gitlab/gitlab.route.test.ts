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
  assertProviderUrlResolvable: vi.fn(async () => undefined),
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
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { db } from "@/lib/database/client";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

/** The saved connection's id from a save or mark answer. */
async function savedId(response: Response): Promise<string> {
  const body = (await response.json()) as { gitlabConnection?: { id: string } };
  return body.gitlabConnection?.id ?? "";
}

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

  describe("connections", () => {
    const serverUrl = "https://git.acme.example/";

    it("hides the connections from people who can't read integrations", async () => {
      const identity = fixture.createWorkosIdentityWithRole("member");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };

      const read = await client.api.orgs[":organizationSlug"].gitlab.connection.$get(
        { param },
        { headers },
      );
      const list = await client.api.orgs[":organizationSlug"].gitlab.connections.$get(
        { param },
        { headers },
      );

      expect([read.status, list.status]).toEqual([403, 403]);
    });

    function mockGitLabServer(username = "translations-bot") {
      mocks.withPublicHttpFetch.mockImplementation(
        async (url: string, _init: unknown, handler: (response: Response) => unknown) =>
          handler(
            url.includes("/api/v4/user")
              ? Response.json({ username })
              : url.includes("/personal_access_tokens/self")
                ? new Response("{}", { status: 404 }) // an older server
                : Response.json([]),
          ),
      );
    }

    beforeEach(() => {
      mocks.withPublicHttpFetch.mockReset();
      mocks.assertProviderUrlResolvable.mockClear();
    });

    it("adds, lists, marks the default, replaces and removes connections without returning a token", async () => {
      mockGitLabServer();
      const identity = fixture.createWorkosIdentityWithRole("admin");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };
      const gitlab = client.api.orgs[":organizationSlug"].gitlab;

      const first = await gitlab.connections.$post(
        { param, json: { serverUrl, accessToken: "glpat-secret-abcd" } },
        { headers },
      );
      expect(first.status).toBe(201);
      // A save answers with what the token can do, so the row needn't check again.
      const firstBody = (await first.json()) as {
        gitlabConnection: { id: string };
        check: unknown;
      };
      const firstId = firstBody.gitlabConnection.id;
      expect(firstBody.check).toEqual({ abilities: null, readsProjects: false });
      mockGitLabServer("code-bot");
      const second = await gitlab.connections.$post(
        {
          param,
          json: { name: "Code", serverUrl: "https://code.acme.example", accessToken: "glpat-two" },
        },
        { headers },
      );
      expect(second.status).toBe(201);
      const secondId = await savedId(second);

      const list = await gitlab.connections.$get({ param }, { headers });
      const listBody = await list.text();
      expect(JSON.parse(listBody)).toEqual({
        gitlabConnections: [
          expect.objectContaining({
            id: firstId,
            name: "git.acme.example",
            serverUrl: "https://git.acme.example",
            connectedUsername: "translations-bot",
            isDefault: true,
            syncCount: 0,
          }),
          expect.objectContaining({ id: secondId, name: "Code", isDefault: false }),
        ],
      });
      expect(listBody).not.toContain("glpat-");
      const read = await gitlab.connection.$get({ param }, { headers });
      expect(await read.json()).toMatchObject({ gitlabConnection: { id: firstId } });

      const marked = await gitlab.connections[":connectionId"].default.$post(
        { param: { ...param, connectionId: secondId } },
        { headers },
      );
      expect(marked.status).toBe(200);
      expect(await marked.json()).toMatchObject({
        gitlabConnection: { id: secondId, isDefault: true },
      });
      const readAgain = await gitlab.connection.$get({ param }, { headers });
      expect(await readAgain.json()).toMatchObject({ gitlabConnection: { id: secondId } });

      mockGitLabServer("renamed-bot");
      const replaced = await gitlab.connections[":connectionId"].$put(
        {
          param: { ...param, connectionId: firstId },
          json: { name: "Web", serverUrl, accessToken: "glpat-three" },
        },
        { headers },
      );
      expect(replaced.status).toBe(200);
      expect(await replaced.json()).toMatchObject({
        gitlabConnection: { id: firstId, name: "Web", connectedUsername: "renamed-bot" },
      });

      const removed = await gitlab.connections[":connectionId"].$delete(
        { param: { ...param, connectionId: secondId } },
        { headers },
      );
      expect(removed.status).toBe(204);
      expect(await removed.text()).toBe("");
      const after = await gitlab.connection.$get({ param }, { headers });
      expect(await after.json()).toMatchObject({ gitlabConnection: { id: firstId } });
    });

    it("lets developers run the live check, refuses members, and reports a missing connection", async () => {
      const member = fixture.createWorkosIdentityWithRole("member");
      const memberHeaders = await fixture.authHeadersFor(member);
      const developer = fixture.createWorkosIdentityWithRole("developer");
      const developerHeaders = await fixture.authHeadersFor(developer);
      const check = client.api.orgs[":organizationSlug"].gitlab.connections[":connectionId"].check;
      const connectionId = "00000000-0000-4000-8000-000000000000";

      const refused = await check.$get(
        { param: { organizationSlug: member.organization.slug ?? "missing-slug", connectionId } },
        { headers: memberHeaders },
      );
      const missing = await check.$get(
        {
          param: { organizationSlug: developer.organization.slug ?? "missing-slug", connectionId },
        },
        { headers: developerHeaders },
      );

      expect(refused.status).toBe(403);
      expect(missing.status).toBe(404);
      expect(mocks.withPublicHttpFetch).not.toHaveBeenCalled();
    });

    it("checks a saved token live and reports when it stops working", async () => {
      mockGitLabServer();
      const identity = fixture.createWorkosIdentityWithRole("admin");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };
      const gitlab = client.api.orgs[":organizationSlug"].gitlab;
      const saved = await gitlab.connections.$post(
        { param, json: { serverUrl, accessToken: "glpat-secret-abcd" } },
        { headers },
      );
      const connectionId = await savedId(saved);
      const check = gitlab.connections[":connectionId"].check;

      const working = await check.$get({ param: { ...param, connectionId } }, { headers });
      expect(await working.json()).toEqual({
        working: true,
        abilities: null,
        readsProjects: false,
      });

      mocks.withPublicHttpFetch.mockImplementation(
        async (_url: string, _init: unknown, handler: (response: Response) => unknown) =>
          handler(new Response("{}", { status: 401 })),
      );
      const stopped = await check.$get({ param: { ...param, connectionId } }, { headers });
      expect(await stopped.json()).toMatchObject({
        working: false,
        code: "gitlab_token_rejected",
      });
    });

    it("counts the workspace as connected once: not again for a replacement or a second connection", async () => {
      mockGitLabServer();
      const track = vi.spyOn(serverAnalytics, "track").mockImplementation(() => {});
      const identity = fixture.createWorkosIdentityWithRole("admin");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };
      const gitlab = client.api.orgs[":organizationSlug"].gitlab;
      const json = { serverUrl, accessToken: "glpat-secret-abcd" };

      const first = await gitlab.connections.$post({ param, json }, { headers });
      const connectionId = await savedId(first);
      const second = await gitlab.connections[":connectionId"].$put(
        { param: { ...param, connectionId }, json },
        { headers },
      );
      const third = await gitlab.connections.$post(
        { param, json: { ...json, name: "Two" } },
        { headers },
      );
      const calls = [...track.mock.calls];
      track.mockRestore();

      expect([first.status, second.status, third.status]).toEqual([201, 200, 201]);
      const connected = calls.filter(
        ([event]) => event === PRODUCT_USAGE_ANALYTICS_EVENTS.integrationConnected,
      );
      expect(connected).toHaveLength(1);
    });

    it("refuses a malformed body, and a replacement, mark or removal of a connection that isn't there", async () => {
      const identity = fixture.createWorkosIdentityWithRole("admin");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };
      const gitlab = client.api.orgs[":organizationSlug"].gitlab;
      const connectionId = "00000000-0000-4000-8000-000000000000";

      const malformed = await gitlab.connections.$post(
        { param, json: { serverUrl: "", accessToken: "" } },
        { headers },
      );
      const removed = await gitlab.connections[":connectionId"].$delete(
        { param: { ...param, connectionId } },
        { headers },
      );
      const marked = await gitlab.connections[":connectionId"].default.$post(
        { param: { ...param, connectionId } },
        { headers },
      );
      const notUuid = await gitlab.connections[":connectionId"].$delete(
        { param: { ...param, connectionId: "nope" } },
        { headers },
      );

      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toMatchObject({ error: "invalid_gitlab_connection_payload" });
      expect([removed.status, marked.status, notUuid.status]).toEqual([404, 404, 404]);
    });

    it("explains a rejected token and saves nothing", async () => {
      mocks.withPublicHttpFetch.mockImplementation(
        async (_url: string, _init: unknown, handler: (response: Response) => unknown) =>
          handler(new Response("{}", { status: 401 })),
      );
      const identity = fixture.createWorkosIdentityWithRole("admin");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };
      const gitlab = client.api.orgs[":organizationSlug"].gitlab;

      const saved = await gitlab.connections.$post(
        { param, json: { serverUrl, accessToken: "glpat-bad" } },
        { headers },
      );

      expect(saved.status).toBe(400);
      expect(await saved.json()).toMatchObject({ error: "gitlab_token_rejected" });
      const read = await gitlab.connection.$get({ param }, { headers });
      expect(await read.json()).toEqual({ gitlabConnection: null });
    });

    it("refuses a private address without contacting it", async () => {
      const identity = fixture.createWorkosIdentityWithRole("admin");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };

      const saved = await client.api.orgs[":organizationSlug"].gitlab.connections.$post(
        { param, json: { serverUrl: "https://10.0.0.5", accessToken: "glpat-secret" } },
        { headers },
      );

      expect(saved.status).toBe(400);
      expect(await saved.json()).toMatchObject({ error: "gitlab_server_url_invalid" });
      expect(mocks.withPublicHttpFetch).not.toHaveBeenCalled();
    });

    it("lets developers read the connections but not change them", async () => {
      const identity = fixture.createWorkosIdentityWithRole("developer");
      const headers = await fixture.authHeadersFor(identity);
      const param = { organizationSlug: identity.organization.slug ?? "missing-slug" };
      const gitlab = client.api.orgs[":organizationSlug"].gitlab;
      const connectionId = "00000000-0000-4000-8000-000000000000";

      const saved = await gitlab.connections.$post(
        { param, json: { serverUrl, accessToken: "glpat-secret" } },
        { headers },
      );
      const replaced = await gitlab.connections[":connectionId"].$put(
        { param: { ...param, connectionId }, json: { serverUrl, accessToken: "glpat-secret" } },
        { headers },
      );
      const removed = await gitlab.connections[":connectionId"].$delete(
        { param: { ...param, connectionId } },
        { headers },
      );
      const marked = await gitlab.connections[":connectionId"].default.$post(
        { param: { ...param, connectionId } },
        { headers },
      );
      const read = await gitlab.connection.$get({ param }, { headers });
      const list = await gitlab.connections.$get({ param }, { headers });

      expect([read.status, list.status]).toEqual([200, 200]);
      expect([saved.status, replaced.status, removed.status, marked.status]).toEqual([
        403, 403, 403, 403,
      ]);
      expect(mocks.withPublicHttpFetch).not.toHaveBeenCalled();
    });
  });
});
