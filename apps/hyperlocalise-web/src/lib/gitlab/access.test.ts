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

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getGitLabConnection: vi.fn(),
  loadGitLabConnectionCredentials: vi.fn(),
  loadGitLabPipesAccessToken: vi.fn(),
}));

vi.mock("./connections", () => ({
  getGitLabConnection: mocks.getGitLabConnection,
  loadGitLabConnectionCredentials: mocks.loadGitLabConnectionCredentials,
}));
vi.mock("./pipes", () => ({
  loadGitLabPipesAccessToken: mocks.loadGitLabPipesAccessToken,
}));

import { err, isErr, isOk, ok } from "@/lib/primitives/result/results";

import { buildGitLabCloneUrl } from "./client";
import {
  checkStoredGitLabContext,
  keepGitLabContextIfCurrent,
  resolveGitLabAccess,
  resolveGitLabCredentialOwner,
} from "./access";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadGitLabConnectionCredentials.mockResolvedValue(ok(null));
  mocks.getGitLabConnection.mockResolvedValue(null);
});

describe("resolveGitLabAccess", () => {
  it("prefers the workspace's server over a person's GitLab.com account", async () => {
    mocks.loadGitLabConnectionCredentials.mockResolvedValue(
      ok({ baseUrl: "https://git.acme.example", accessToken: "server-token" }),
    );

    const result = await resolveGitLabAccess({
      localOrganizationId: "org_1",
      workosUserId: "user_1",
    });

    expect(isOk(result) && result.value).toEqual({
      baseUrl: "https://git.acme.example",
      accessToken: "server-token",
    });
    expect(mocks.loadGitLabPipesAccessToken).not.toHaveBeenCalled();
  });

  it("doesn't fall back to GitLab.com when the saved token can't be read", async () => {
    mocks.loadGitLabConnectionCredentials.mockResolvedValue(
      err({ code: "gitlab_connection_decrypt_failed", message: "Connect GitLab again." }),
    );

    const result = await resolveGitLabAccess({
      localOrganizationId: "org_1",
      workosUserId: "user_1",
    });

    expect(isErr(result) && result.error.code).toBe("gitlab_connection_decrypt_failed");
    expect(mocks.loadGitLabPipesAccessToken).not.toHaveBeenCalled();
  });

  it("uses a person's GitLab.com account without a server", async () => {
    mocks.loadGitLabPipesAccessToken.mockResolvedValue(ok("oauth-token"));

    const result = await resolveGitLabAccess({
      localOrganizationId: "org_1",
      workosUserId: "user_1",
    });

    expect(isOk(result) && result.value).toEqual({ accessToken: "oauth-token", baseUrl: null });
  });

  it("reports not connected with neither", async () => {
    const result = await resolveGitLabAccess({ localOrganizationId: "org_1" });

    expect(isErr(result) && result.error.code).toBe("gitlab_not_connected");
  });

  it("uses the connection asked for, and says when that one was removed rather than falling back", async () => {
    mocks.loadGitLabConnectionCredentials.mockResolvedValue(
      ok({ id: "conn_2", baseUrl: "https://code.acme.example", accessToken: "code-token" }),
    );
    const chosen = await resolveGitLabAccess({
      localOrganizationId: "org_1",
      workosUserId: "user_1",
      connectionId: "conn_2",
    });
    expect(mocks.loadGitLabConnectionCredentials).toHaveBeenCalledWith({
      organizationId: "org_1",
      connectionId: "conn_2",
    });
    expect(isOk(chosen) && chosen.value).toEqual({
      baseUrl: "https://code.acme.example",
      accessToken: "code-token",
    });

    mocks.loadGitLabConnectionCredentials.mockResolvedValue(ok(null));
    const removed = await resolveGitLabAccess({
      localOrganizationId: "org_1",
      workosUserId: "user_1",
      connectionId: "conn_2",
    });
    expect(isErr(removed) && removed.error.code).toBe("gitlab_connection_removed");
    expect(mocks.loadGitLabPipesAccessToken).not.toHaveBeenCalled();
  });
});

describe("resolveGitLabCredentialOwner", () => {
  it("changes on every save, so a clone made with an old token isn't reused", async () => {
    mocks.getGitLabConnection.mockResolvedValueOnce({
      serverUrl: "https://a.example",
      updatedAt: "2026-11-03T00:00:00.000Z",
    });
    mocks.getGitLabConnection.mockResolvedValueOnce({
      serverUrl: "https://a.example",
      updatedAt: "2026-11-03T00:05:00.000Z",
    });
    const input = { localOrganizationId: "org_1", workosUserId: "user_1" };

    expect(await resolveGitLabCredentialOwner(input)).not.toBe(
      await resolveGitLabCredentialOwner(input),
    );
  });

  it("stays the same between saves, so the clone is reused", async () => {
    mocks.getGitLabConnection.mockResolvedValue({
      serverUrl: "https://a.example",
      updatedAt: "2026-11-03T00:00:00.000Z",
    });
    const input = { localOrganizationId: "org_1", workosUserId: "user_1" };

    expect(await resolveGitLabCredentialOwner(input)).toBe(
      await resolveGitLabCredentialOwner(input),
    );
  });

  it("is the person without a server, and nobody without either", async () => {
    mocks.getGitLabConnection.mockResolvedValue(null);

    expect(
      await resolveGitLabCredentialOwner({ localOrganizationId: "org_1", workosUserId: "user_1" }),
    ).toBe("user_1");
    expect(await resolveGitLabCredentialOwner({ localOrganizationId: "org_1" })).toBeNull();
  });
});

describe("buildGitLabCloneUrl", () => {
  it("uses the server when there is one and GitLab.com otherwise", () => {
    expect(buildGitLabCloneUrl("https://git.acme.example/gitlab", "acme/web")).toBe(
      "https://git.acme.example/gitlab/acme/web.git",
    );
    expect(buildGitLabCloneUrl(null, "acme/web")).toBe("https://gitlab.com/acme/web.git");
  });
});

describe("keepGitLabContextIfCurrent", () => {
  const context = {
    repositoryFullName: "acme/web",
    httpUrlToRepo: "https://git.acme.example/acme/web.git",
  };
  const savedServer = (baseUrl: string) =>
    mocks.loadGitLabConnectionCredentials.mockResolvedValue(
      ok({ baseUrl, accessToken: "glpat-saved" }),
    );

  it("keeps a context from the saved server", async () => {
    savedServer("https://git.acme.example");

    expect(await keepGitLabContextIfCurrent({ localOrganizationId: "org_1", context })).toBe(
      context,
    );
  });

  it("drops a context once the server is replaced or removed", async () => {
    savedServer("https://code.acme.example");
    expect(await checkStoredGitLabContext({ localOrganizationId: "org_1", context })).toEqual({
      context: null,
      dropped: "server_changed",
    });

    mocks.loadGitLabConnectionCredentials.mockResolvedValue(ok(null));
    expect(await checkStoredGitLabContext({ localOrganizationId: "org_1", context })).toEqual({
      context: null,
      dropped: "server_changed",
    });
  });

  it("drops a context when the saved token can't be read", async () => {
    mocks.loadGitLabConnectionCredentials.mockResolvedValue(
      err({ code: "gitlab_connection_decrypt_failed", message: "Unable to read" }),
    );

    expect(await checkStoredGitLabContext({ localOrganizationId: "org_1", context })).toEqual({
      context: null,
      dropped: "token_unreadable",
    });
  });

  it("keeps a GitLab.com context while there is no server", async () => {
    const gitlabComContext = { ...context, httpUrlToRepo: "https://gitlab.com/acme/web.git" };

    expect(
      await keepGitLabContextIfCurrent({ localOrganizationId: "org_1", context: gitlabComContext }),
    ).toBe(gitlabComContext);
    expect(await checkStoredGitLabContext({ localOrganizationId: "org_1", context: null })).toEqual(
      { context: null, dropped: null },
    );
  });
});
