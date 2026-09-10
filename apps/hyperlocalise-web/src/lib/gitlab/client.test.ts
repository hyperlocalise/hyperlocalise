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

import { isErr, isOk } from "@/lib/primitives/result/results";

import { getGitLabMergeRequest, getGitLabProject, listGitLabMembershipProjects } from "./client";

describe("gitlab client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists membership projects and skips archived rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            id: 11,
            name: "web",
            path_with_namespace: "acme/web",
            http_url_to_repo: "https://gitlab.com/acme/web.git",
            default_branch: "main",
            archived: false,
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
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGitLabMembershipProjects({ accessToken: "token" });

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
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });

  it("loads a project by path_with_namespace", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 99,
          name: "web",
          path_with_namespace: "acme/platform/web",
          http_url_to_repo: "https://gitlab.com/acme/platform/web.git",
          default_branch: "develop",
          archived: false,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getGitLabProject({
      accessToken: "token",
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "",
      }),
    );

    const result = await getGitLabMergeRequest({
      accessToken: "token",
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
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            iid: 42,
            source_branch: "fix-copy",
            sha: "abc123",
            diff_refs: { head_sha: "def456" },
          }),
      }),
    );

    const result = await getGitLabMergeRequest({
      accessToken: "token",
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
});
