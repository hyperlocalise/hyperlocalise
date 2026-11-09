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

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { eq } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  withPublicHttpFetch: vi.fn(),
  assertProviderUrlResolvable: vi.fn(async () => undefined),
}));

vi.mock("@/lib/security/public-http-fetch", () => ({
  withPublicHttpFetch: mocks.withPublicHttpFetch,
}));
vi.mock("@/lib/providers/shared/provider-url-resolve", () => ({
  assertProviderUrlResolvable: mocks.assertProviderUrlResolvable,
}));

import { randomUUID } from "node:crypto";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { uniqueTestProjectIdentifier } from "@/lib/projects/issue-identifier/test-project-identifier";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  checkSavedGitLabConnection,
  deleteGitLabConnection,
  findGitLabConnection,
  getGitLabConnection,
  listGitLabConnections,
  loadGitLabConnectionCredentials,
  saveGitLabConnection,
  setDefaultGitLabConnection,
} from "./connections";

const fixture = createAuthTestFixture();

async function seedScope() {
  const identity = fixture.createWorkosIdentityWithRole("admin");
  await fixture.authHeadersFor(identity);
  return {
    organizationId: globalThis.__testApiAuthContext!.organization.localOrganizationId,
    userId: globalThis.__testApiAuthContext!.user.localUserId,
  };
}

function mockServer(answer: (url: string) => Response) {
  mocks.withPublicHttpFetch.mockImplementation(
    async (url: string, _init: unknown, handler: (response: Response) => unknown) =>
      handler(answer(url)),
  );
}

const healthyServer =
  (username = "translations-bot") =>
  (url: string) =>
    Response.json(url.includes("/api/v4/user") ? { username } : []);

describe("gitlab connections", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    mocks.withPublicHttpFetch.mockReset();
    await fixture.cleanup();
  });

  it("stores the token encrypted and only the loader returns it", async () => {
    mockServer(healthyServer());
    const scope = await seedScope();

    const saved = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example/gitlab/",
      accessToken: " glpat-secret-abcd ",
    });

    expect(isOk(saved) && saved.value.connection).toMatchObject({
      serverUrl: "https://git.acme.example/gitlab",
      connectedUsername: "translations-bot",
    });
    expect(JSON.stringify(saved)).not.toContain("glpat-secret-abcd");

    const [row] = await db
      .select()
      .from(schema.gitlabConnections)
      .where(eq(schema.gitlabConnections.organizationId, scope.organizationId));
    expect(row?.ciphertext).not.toContain("glpat-secret-abcd");

    const loaded = await loadGitLabConnectionCredentials({ organizationId: scope.organizationId });
    expect(isOk(loaded) && loaded.value).toMatchObject({
      baseUrl: "https://git.acme.example/gitlab",
      accessToken: "glpat-secret-abcd",
    });
  });

  it("adds a second connection beside the first, which stays the default until another is chosen", async () => {
    mockServer(healthyServer());
    const scope = await seedScope();
    const first = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-first",
    });

    mockServer(healthyServer("other-bot"));
    const second = await saveGitLabConnection({
      ...scope,
      name: " Code server ",
      serverUrl: "https://code.acme.example",
      accessToken: "glpat-second",
    });
    if (!isOk(first) || !isOk(second)) {
      throw new Error("save failed");
    }

    // A connection from before names is called by its host; the default is the oldest.
    expect(await listGitLabConnections({ organizationId: scope.organizationId })).toMatchObject([
      { id: first.value.connection.id, name: "git.acme.example", isDefault: true, syncCount: 0 },
      { id: second.value.connection.id, name: "Code server", isDefault: false },
    ]);
    expect(await getGitLabConnection({ organizationId: scope.organizationId })).toMatchObject({
      serverUrl: "https://git.acme.example",
      connectedUsername: "translations-bot",
    });
    const byId = await loadGitLabConnectionCredentials({
      organizationId: scope.organizationId,
      connectionId: second.value.connection.id,
    });
    expect(isOk(byId) && byId.value).toEqual({
      id: second.value.connection.id,
      baseUrl: "https://code.acme.example",
      accessToken: "glpat-second",
    });

    expect(
      await setDefaultGitLabConnection({
        organizationId: scope.organizationId,
        connectionId: second.value.connection.id,
      }),
    ).toBe(true);
    expect(await getGitLabConnection({ organizationId: scope.organizationId })).toMatchObject({
      id: second.value.connection.id,
      isDefault: true,
    });
    // Marking is not an edit: the save times stay, so neither connection is checked again.
    const marked = await listGitLabConnections({ organizationId: scope.organizationId });
    expect(marked.map((connection) => [connection.id, connection.updatedAt])).toEqual(
      expect.arrayContaining([
        [first.value.connection.id, first.value.connection.updatedAt],
        [second.value.connection.id, second.value.connection.updatedAt],
      ]),
    );
    expect(
      await findGitLabConnection({
        organizationId: scope.organizationId,
        connectionId: first.value.connection.id,
      }),
    ).toMatchObject({ isDefault: false });
    const loaded = await loadGitLabConnectionCredentials({ organizationId: scope.organizationId });
    expect(isOk(loaded) && loaded.value?.accessToken).toBe("glpat-second");

    // Replacing keeps the id, so a sync that names it follows the change.
    mockServer(healthyServer("renamed-bot"));
    const replaced = await saveGitLabConnection({
      ...scope,
      connectionId: second.value.connection.id,
      name: "Code",
      serverUrl: "https://code.acme.example",
      accessToken: "glpat-third",
    });
    expect(isOk(replaced) && replaced.value).toMatchObject({
      created: false,
      connection: {
        id: second.value.connection.id,
        name: "Code",
        connectedUsername: "renamed-bot",
      },
    });
    const rows = await db
      .select({ id: schema.gitlabConnections.id })
      .from(schema.gitlabConnections)
      .where(eq(schema.gitlabConnections.organizationId, scope.organizationId));
    expect(rows).toHaveLength(2);
  });

  it("reports what the token can do: scopes and expiry from GitLab, and whether it reads any project", async () => {
    const scope = await seedScope();
    mockServer((url) =>
      url.includes("/api/v4/user")
        ? Response.json({ username: "translations-bot" })
        : url.includes("/personal_access_tokens/self")
          ? Response.json({ scopes: ["read_api", "read_repository"], expires_at: "2027-11-05" })
          : Response.json([{ id: 1 }]),
    );
    const saved = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-read",
    });
    expect(isOk(saved) && saved.value.check).toEqual({
      abilities: {
        scopes: ["read_api", "read_repository"],
        canSend: false,
        expiresAt: "2027-11-05",
      },
      readsProjects: true,
    });

    // A token GitLab can't describe, with the Guest role everywhere, reads nothing; a failing
    // description call never fails the check.
    mockServer((url) =>
      url.includes("/api/v4/user")
        ? Response.json({ username: "translations-bot" })
        : url.includes("/personal_access_tokens/self")
          ? new Response("{}", { status: 500 })
          : Response.json([]),
    );
    const checked = await checkSavedGitLabConnection({ organizationId: scope.organizationId });
    expect(isOk(checked) && checked.value).toEqual({ abilities: null, readsProjects: false });
  });

  it("counts the project syncs that name each connection", async () => {
    mockServer(healthyServer());
    const scope = await seedScope();
    const first = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-first",
    });
    const second = await saveGitLabConnection({
      ...scope,
      name: "Code",
      serverUrl: "https://code.acme.example",
      accessToken: "glpat-second",
    });
    if (!isOk(first) || !isOk(second)) {
      throw new Error("save failed");
    }
    const team = await ensureDefaultWorkspaceTeam(scope.organizationId);
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        identifier: uniqueTestProjectIdentifier(),
        organizationId: scope.organizationId,
        teamId: team.id,
        createdByUserId: scope.userId,
        name: "Synced project",
        source: "native",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning({ id: schema.projects.id });
    await db.insert(schema.projectContentSyncs).values({
      organizationId: scope.organizationId,
      projectId: project!.id,
      syncConfig: {
        provider: "gitlab",
        connectionId: "42",
        resourceKey: "acme/app",
        providerFolder: "locales",
        projectFolder: "gitlab/acme/app",
        pathTemplate: "{{locale}}.json",
        gitlabConnectionId: second.value.connection.id,
      },
      schedule: "manual",
    });

    expect(await listGitLabConnections({ organizationId: scope.organizationId })).toMatchObject([
      { id: first.value.connection.id, syncCount: 0 },
      { id: second.value.connection.id, syncCount: 1 },
    ]);
    expect(
      await findGitLabConnection({
        organizationId: scope.organizationId,
        connectionId: second.value.connection.id,
      }),
    ).toMatchObject({ syncCount: 1 });
  });

  it("refuses to replace or mark a connection that isn't the workspace's", async () => {
    mockServer(healthyServer());
    const scope = await seedScope();
    const stranger = "00000000-0000-4000-8000-000000000000";

    const replaced = await saveGitLabConnection({
      ...scope,
      connectionId: stranger,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-good",
    });
    expect(isErr(replaced) && replaced.error.code).toBe("gitlab_connection_not_found");
    expect(
      await setDefaultGitLabConnection({
        organizationId: scope.organizationId,
        connectionId: stranger,
      }),
    ).toBe(false);
    expect(
      await loadGitLabConnectionCredentials({
        organizationId: scope.organizationId,
        connectionId: stranger,
      }),
    ).toEqual(
      isOk(await loadGitLabConnectionCredentials({ organizationId: scope.organizationId }))
        ? { ok: true, value: null }
        : null,
    );
  });

  it.each([
    ["a rejected token", () => new Response("{}", { status: 401 }), "gitlab_token_rejected"],
    [
      "something that is not GitLab",
      () => new Response("<html>hello</html>"),
      "gitlab_server_not_recognized",
    ],
    [
      "an address with no GitLab API",
      () => new Response("{}", { status: 404 }),
      "gitlab_server_not_recognized",
    ],
  ])("refuses %s and keeps the existing connection", async (_name, answer, code) => {
    mockServer(healthyServer());
    const scope = await seedScope();
    await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-good",
    });

    mockServer(answer);
    const result = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://code.acme.example",
      accessToken: "glpat-new",
    });

    expect(isErr(result) && result.error.code).toBe(code);
    expect(await getGitLabConnection({ organizationId: scope.organizationId })).toMatchObject({
      serverUrl: "https://git.acme.example",
    });
  });

  it("reports the refusal, not the stopped request, when the project check fails first", async () => {
    mocks.withPublicHttpFetch.mockImplementation(
      async (url: string, init: RequestInit, handler: (response: Response) => unknown) => {
        if (url.includes("/api/v4/user")) {
          // Answers only after the other request has failed and stopped this one.
          await new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
          );
        }
        return handler(Response.json({ message: "403 Forbidden" }, { status: 403 }));
      },
    );
    const scope = await seedScope();

    const result = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-read-user-only",
    });

    expect(isErr(result) && result.error.code).toBe("gitlab_token_rejected");
  });

  it("refuses a token that can identify itself but not read projects", async () => {
    mockServer((url) =>
      url.includes("/api/v4/user")
        ? Response.json({ username: "translations-bot" })
        : new Response("{}", { status: 403 }),
    );
    const scope = await seedScope();

    const result = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-read-user-only",
    });

    expect(isErr(result) && result.error.code).toBe("gitlab_token_rejected");
  });

  it.each([502, 429])("says the address answered when it returns %i", async (status) => {
    mockServer(() => new Response("{}", { status }));
    const scope = await seedScope();

    const result = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-good",
    });

    expect(isErr(result) && result.error).toMatchObject({
      code: "gitlab_server_unreachable",
      message: expect.stringContaining("answered with an error"),
    });
  });

  it("explains a connection that fails before any answer", async () => {
    mocks.withPublicHttpFetch.mockRejectedValue(new Error("connect failed"));
    const scope = await seedScope();

    const result = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-good",
    });

    expect(isErr(result) && result.error).toMatchObject({
      code: "gitlab_server_unreachable",
      message: expect.stringContaining("certificate"),
    });
  });

  it("refuses a token with spaces inside without sending it", async () => {
    const scope = await seedScope();

    const result = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat one\ntwo",
    });

    expect(isErr(result) && result.error.code).toBe("gitlab_token_invalid");
    expect(mocks.withPublicHttpFetch).not.toHaveBeenCalled();
  });

  it("says whether a save made the connection or replaced it, and keeps who made it", async () => {
    mockServer(healthyServer());
    const scope = await seedScope();
    const input = { ...scope, serverUrl: "https://git.acme.example", accessToken: "glpat-good" };

    const first = await saveGitLabConnection(input);
    const connectionId = isOk(first) ? first.value.connection.id : null;
    const otherIdentity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(otherIdentity);
    const otherUserId = globalThis.__testApiAuthContext!.user.localUserId;
    expect(otherUserId).not.toBe(scope.userId);
    const second = await saveGitLabConnection({ ...input, connectionId, userId: otherUserId });

    expect(isOk(first) && first.value.created).toBe(true);
    expect(isOk(second) && second.value.created).toBe(false);
    const [row] = await db
      .select({ createdBy: schema.gitlabConnections.createdByUserId })
      .from(schema.gitlabConnections)
      .where(eq(schema.gitlabConnections.organizationId, scope.organizationId));
    expect(row?.createdBy).toBe(scope.userId);

    await db
      .update(schema.gitlabConnections)
      .set({ updatedAt: new Date("2020-01-01T00:00:00.000Z") })
      .where(eq(schema.gitlabConnections.organizationId, scope.organizationId));
    const third = await saveGitLabConnection({ ...input, connectionId, userId: otherUserId });
    expect(isOk(third) && new Date(third.value.connection.updatedAt).getTime()).toBeGreaterThan(
      Date.parse("2020-01-01T00:00:00.000Z"),
    );
  });

  it("explains a server that doesn't answer in time", async () => {
    mocks.withPublicHttpFetch.mockRejectedValue(
      new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    );
    const scope = await seedScope();

    const result = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-good",
    });

    expect(isErr(result) && result.error.message).toContain("didn't answer in time");
  });

  it("reports a saved token that can no longer be read, without falling back", async () => {
    mockServer(healthyServer());
    const scope = await seedScope();
    await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-good",
    });
    await db
      .update(schema.gitlabConnections)
      .set({ authTag: "AAAAAAAAAAAAAAAAAAAAAA==" })
      .where(eq(schema.gitlabConnections.organizationId, scope.organizationId));

    const loaded = await loadGitLabConnectionCredentials({ organizationId: scope.organizationId });

    expect(isErr(loaded) && loaded.error.code).toBe("gitlab_connection_decrypt_failed");
  });

  it("reports no credentials once the connection is removed", async () => {
    mockServer(healthyServer());
    const scope = await seedScope();
    const saved = await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-good",
    });
    const connectionId = isOk(saved) ? saved.value.connection.id : "";

    expect(
      await deleteGitLabConnection({ organizationId: scope.organizationId, connectionId }),
    ).toBe(true);
    expect(
      await deleteGitLabConnection({ organizationId: scope.organizationId, connectionId }),
    ).toBe(false);

    const loaded = await loadGitLabConnectionCredentials({ organizationId: scope.organizationId });
    expect(isOk(loaded) && loaded.value).toBeNull();
  });
});
