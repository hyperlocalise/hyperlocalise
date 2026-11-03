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

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  deleteGitLabConnection,
  getGitLabConnection,
  loadGitLabConnectionCredentials,
  saveGitLabConnection,
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
    expect(isOk(loaded) && loaded.value).toEqual({
      baseUrl: "https://git.acme.example/gitlab",
      accessToken: "glpat-secret-abcd",
    });
  });

  it("replaces the workspace's connection on a second save", async () => {
    mockServer(healthyServer());
    const scope = await seedScope();
    await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-first",
    });

    mockServer(healthyServer("other-bot"));
    await saveGitLabConnection({
      ...scope,
      serverUrl: "https://code.acme.example",
      accessToken: "glpat-second",
    });

    expect(await getGitLabConnection({ organizationId: scope.organizationId })).toMatchObject({
      serverUrl: "https://code.acme.example",
      connectedUsername: "other-bot",
    });
    const loaded = await loadGitLabConnectionCredentials({ organizationId: scope.organizationId });
    expect(isOk(loaded) && loaded.value).toEqual({
      baseUrl: "https://code.acme.example",
      accessToken: "glpat-second",
    });
    const rows = await db
      .select({ id: schema.gitlabConnections.id })
      .from(schema.gitlabConnections)
      .where(eq(schema.gitlabConnections.organizationId, scope.organizationId));
    expect(rows).toHaveLength(1);
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
    const second = await saveGitLabConnection({ ...input, userId: scope.userId });

    expect(isOk(first) && first.value.created).toBe(true);
    expect(isOk(second) && second.value.created).toBe(false);
    const [row] = await db
      .select({ createdBy: schema.gitlabConnections.createdByUserId })
      .from(schema.gitlabConnections)
      .where(eq(schema.gitlabConnections.organizationId, scope.organizationId));
    expect(row?.createdBy).toBe(scope.userId);
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
    await saveGitLabConnection({
      ...scope,
      serverUrl: "https://git.acme.example",
      accessToken: "glpat-good",
    });

    expect(await deleteGitLabConnection({ organizationId: scope.organizationId })).toBe(true);
    expect(await deleteGitLabConnection({ organizationId: scope.organizationId })).toBe(false);

    const loaded = await loadGitLabConnectionCredentials({ organizationId: scope.organizationId });
    expect(isOk(loaded) && loaded.value).toBeNull();
  });
});
