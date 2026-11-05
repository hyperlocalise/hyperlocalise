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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr, isOk, ok } from "@/lib/primitives/result/results";

import { withPublicHttpFetch } from "@/lib/security/public-http-fetch";

import {
  getGitLabCurrentUsername,
  getGitLabMergeRequest,
  canReadGitLabRepository,
  checkGitLabProjectAccess,
  getGitLabProject,
  getGitLabTokenAbilities,
  listGitLabMembershipProjects,
} from "./client";

vi.mock("./constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./constants")>()),
  GITLAB_SERVER_REQUEST_TIMEOUT_MS: 20,
}));
vi.mock("@/lib/security/public-http-fetch", () => ({
  withPublicHttpFetch: vi.fn(),
}));

describe("gitlab client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("lists membership projects and skips archived rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 11,
            name: "web",
            path_with_namespace: "acme/web",
            http_url_to_repo: "https://gitlab.com/acme/web.git",
            default_branch: "main",
            archived: false,
            permissions: { project_access: null, group_access: { access_level: 30 } },
          },
          {
            id: 12,
            name: "old",
            path_with_namespace: "acme/old",
            http_url_to_repo: "https://gitlab.com/acme/old.git",
            default_branch: "main",
            archived: true,
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGitLabMembershipProjects({ accessToken: "token", baseUrl: null });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok");
    }
    expect(result.value).toEqual([
      {
        id: 11,
        name: "web",
        pathWithNamespace: "acme/web",
        httpUrlToRepo: "https://gitlab.com/acme/web.git",
        defaultBranch: "main",
        archived: false,
        accessLevel: 30,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    // The full shape, so each project's role is known; only readable projects are asked for.
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("min_access_level=20");
    expect(url).not.toContain("simple=true");
  });

  it("describes the token: its scopes and expiry, or nothing for a kind GitLab can't describe", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ scopes: ["read_api", "read_repository"], expires_at: "2027-01-31" }),
        )
        .mockResolvedValueOnce(Response.json({ scopes: ["api"], expires_at: null }))
        .mockResolvedValueOnce(new Response("{}", { status: 404 }))
        .mockResolvedValueOnce(new Response("{}", { status: 400 }))
        .mockResolvedValueOnce(new Response("{}", { status: 500 })),
    );
    const access = { accessToken: "token", baseUrl: null };

    const readOnly = await getGitLabTokenAbilities(access);
    expect(isOk(readOnly) && readOnly.value).toEqual({
      scopes: ["read_api", "read_repository"],
      canSend: false,
      expiresAt: "2027-01-31",
    });
    const full = await getGitLabTokenAbilities(access);
    expect(isOk(full) && full.value).toEqual({ scopes: ["api"], canSend: true, expiresAt: null });
    // Extra information only: an old server, a refused token kind or a failing server say nothing.
    for (const _status of [404, 400, 500]) {
      const unknown = await getGitLabTokenAbilities(access);
      expect(isOk(unknown) && unknown.value).toBeNull();
    }
  });

  it("settles whether the token can read a project's files by reading its tree", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ name: "README.md" }]))
      .mockResolvedValueOnce(new Response("{}", { status: 403 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const access = { accessToken: "token", baseUrl: null, projectId: 42 };

    expect(await canReadGitLabRepository(access)).toEqual(ok(true));
    expect(await canReadGitLabRepository(access)).toEqual(ok(false));
    expect(await canReadGitLabRepository(access)).toEqual(ok(false));
    const down = await canReadGitLabRepository(access);
    expect(isErr(down) && down.error.code).toBe("gitlab_request_failed");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v4/projects/42/repository/tree");
  });

  it("says whether the token reads at least one project with the Reporter role or above", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ id: 1 }]))
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    const access = { accessToken: "token", baseUrl: null };

    const some = await checkGitLabProjectAccess(access);
    expect(isOk(some) && some.value).toEqual({ readsProjects: true });
    const none = await checkGitLabProjectAccess(access);
    expect(isOk(none) && none.value).toEqual({ readsProjects: false });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("min_access_level=20");
  });

  it("loads a project by path_with_namespace", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 99,
          name: "web",
          path_with_namespace: "acme/platform/web",
          http_url_to_repo: "https://gitlab.com/acme/platform/web.git",
          default_branch: "develop",
          archived: false,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getGitLabProject({
      accessToken: "token",
      baseUrl: null,
      pathWithNamespace: "acme/platform/web",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok");
    }
    expect(result.value.pathWithNamespace).toBe("acme/platform/web");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/v4/projects/acme%2Fplatform%2Fweb",
    );
  });

  it("maps 401 responses to gitlab_unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));

    const result = await getGitLabMergeRequest({
      accessToken: "token",
      baseUrl: null,
      pathWithNamespace: "acme/web",
      mergeRequestIid: 7,
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected err");
    }
    expect(result.error.code).toBe("gitlab_unauthorized");
  });

  it("maps merge request source branch and commit sha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            iid: 42,
            source_branch: "fix-copy",
            sha: "abc123",
            diff_refs: { head_sha: "def456" },
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await getGitLabMergeRequest({
      accessToken: "token",
      baseUrl: null,
      pathWithNamespace: "acme/web",
      mergeRequestIid: 42,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok");
    }
    expect(result.value).toEqual({
      iid: 42,
      sourceBranch: "fix-copy",
      commitSha: "abc123",
    });
  });

  describe("on a workspace's own server", () => {
    const baseUrl = "https://git.acme.example/gitlab";

    function mockServerResponse(status: number, body: unknown) {
      vi.mocked(withPublicHttpFetch).mockImplementation(async (_url, _init, handler) =>
        handler(new Response(JSON.stringify(body), { status })),
      );
    }

    afterEach(() => {
      vi.mocked(withPublicHttpFetch).mockReset();
    });

    it("keeps the server's path and sends requests through the guarded fetch, redirects refused", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      mockServerResponse(200, { username: "translations-bot" });

      const result = await getGitLabCurrentUsername({ accessToken: "token", baseUrl });

      expect(isOk(result) && result.value).toBe("translations-bot");
      expect(fetchMock).not.toHaveBeenCalled();
      const [url, init] = vi.mocked(withPublicHttpFetch).mock.calls[0]!;
      expect(url).toBe("https://git.acme.example/gitlab/api/v4/user");
      expect(init).toMatchObject({
        redirect: "error",
        headers: { Authorization: "Bearer token" },
      });
    });

    it("builds the clone address from the server, ignoring what the server reports", async () => {
      mockServerResponse(200, {
        id: 11,
        name: "web",
        path_with_namespace: "acme/web",
        http_url_to_repo: "https://elsewhere.example/acme/web.git",
        default_branch: "main",
      });

      const result = await getGitLabProject({
        accessToken: "token",
        baseUrl,
        pathWithNamespace: "acme/web",
      });

      expect(isOk(result) && result.value.httpUrlToRepo).toBe(
        "https://git.acme.example/gitlab/acme/web.git",
      );
    });

    it("reports a failed connection as a request failure", async () => {
      vi.mocked(withPublicHttpFetch).mockRejectedValue(new Error("redirect refused"));

      const result = await getGitLabCurrentUsername({ accessToken: "token", baseUrl });

      expect(isErr(result) && result.error).toMatchObject({
        code: "gitlab_request_failed",
        status: 0,
      });
    });

    it("doesn't blame the token when something other than GitLab refuses", async () => {
      vi.mocked(withPublicHttpFetch).mockImplementation(async (_url, _init, handler) =>
        handler(new Response("<html>Blocked</html>", { status: 403 })),
      );

      const result = await getGitLabCurrentUsername({ accessToken: "token", baseUrl });

      expect(isErr(result) && result.error).toMatchObject({
        code: "gitlab_request_failed",
        status: 403,
      });
    });

    it("blames the token when GitLab itself refuses", async () => {
      mockServerResponse(401, { message: "401 Unauthorized" });

      const result = await getGitLabCurrentUsername({ accessToken: "token", baseUrl });

      expect(isErr(result) && result.error.code).toBe("gitlab_unauthorized");
    });

    it("stops waiting when cancelled, even if the address lookup never finishes", async () => {
      vi.mocked(withPublicHttpFetch).mockReturnValue(new Promise(() => {}));
      const controller = new AbortController();

      const pending = getGitLabCurrentUsername({
        accessToken: "token",
        baseUrl,
        signal: controller.signal,
      });
      controller.abort();
      const result = await pending;

      expect(isErr(result) && result.error).toMatchObject({ status: 0 });
    });

    it("treats a local server as a normal request in a development build only", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ username: "local-bot" })));
      vi.stubGlobal("fetch", fetchMock);
      vi.stubEnv("NODE_ENV", "development");

      const result = await getGitLabCurrentUsername({
        accessToken: "token",
        baseUrl: "http://localhost:8929",
      });

      expect(isOk(result) && result.value).toBe("local-bot");
      expect(withPublicHttpFetch).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
    });

    it("gives up at the timeout and marks the request as timed out", async () => {
      vi.mocked(withPublicHttpFetch).mockReturnValue(new Promise(() => {}));

      const result = await getGitLabCurrentUsername({ accessToken: "token", baseUrl });

      expect(isErr(result) && result.error).toMatchObject({ status: 0, timedOut: true });
    });

    it("sends a local address through the guarded path outside development", async () => {
      vi.mocked(withPublicHttpFetch).mockRejectedValue(new Error("blocked host"));

      const result = await getGitLabCurrentUsername({
        accessToken: "token",
        baseUrl: "http://localhost:8929",
      });

      expect(isErr(result)).toBe(true);
      expect(withPublicHttpFetch).toHaveBeenCalled();
    });
  });
});
