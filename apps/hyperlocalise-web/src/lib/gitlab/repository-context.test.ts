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

const {
  loadGitLabPipesAccessTokenMock,
  getGitLabProjectMock,
  getGitLabMergeRequestMock,
  getGitLabConnectionMock,
  loadGitLabConnectionCredentialsMock,
} = vi.hoisted(() => ({
  loadGitLabPipesAccessTokenMock: vi.fn(),
  getGitLabProjectMock: vi.fn(),
  getGitLabMergeRequestMock: vi.fn(),
  getGitLabConnectionMock: vi.fn(),
  loadGitLabConnectionCredentialsMock: vi.fn(),
}));

vi.mock("./connections", () => ({
  getGitLabConnection: getGitLabConnectionMock,
  loadGitLabConnectionCredentials: loadGitLabConnectionCredentialsMock,
}));

vi.mock("./pipes", () => ({
  loadGitLabPipesAccessToken: loadGitLabPipesAccessTokenMock,
  resolveGitLabPipesWorkosUserId: vi.fn(async (input: { workosUserId?: string | null }) =>
    input.workosUserId ? input.workosUserId : null,
  ),
}));

vi.mock("./client", () => ({
  getGitLabProject: getGitLabProjectMock,
  getGitLabMergeRequest: getGitLabMergeRequestMock,
  listGitLabMembershipProjects: vi.fn(),
}));

import { err, ok } from "@/lib/primitives/result/results";

import {
  resolveConversationRepositoryGitLabContext,
  resolveGitLabProjectContext,
} from "./repository-context";

describe("resolveGitLabProjectContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGitLabConnectionMock.mockResolvedValue(null);
    loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(null));
  });

  it("returns sandbox clone context for a membership project", async () => {
    loadGitLabPipesAccessTokenMock.mockResolvedValue(ok("oauth-token"));
    getGitLabProjectMock.mockResolvedValue(
      ok({
        id: 11,
        name: "web",
        pathWithNamespace: "acme/platform/web",
        defaultBranch: "main",
        httpUrlToRepo: "https://gitlab.com/acme/platform/web.git",
        archived: false,
      }),
    );

    await expect(
      resolveGitLabProjectContext({
        localOrganizationId: "org-local",
        workosUserId: "user_workos",
        pathWithNamespace: "acme/platform/web",
      }),
    ).resolves.toEqual({
      resolved: true,
      provider: "gitlab",
      projectId: 11,
      repositoryFullName: "acme/platform/web",
      httpUrlToRepo: "https://gitlab.com/acme/platform/web.git",
      branch: "main",
    });
  });

  it("returns null when GitLab is not connected", async () => {
    loadGitLabPipesAccessTokenMock.mockResolvedValue(
      err({ code: "gitlab_not_connected", message: "Connect GitLab" }),
    );

    await expect(
      resolveGitLabProjectContext({
        localOrganizationId: "org-local",
        workosUserId: "user_workos",
        pathWithNamespace: "acme/web",
      }),
    ).resolves.toBeNull();
  });
});

describe("resolveConversationRepositoryGitLabContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGitLabConnectionMock.mockResolvedValue(null);
    loadGitLabConnectionCredentialsMock.mockResolvedValue(ok(null));
  });

  it("resolves a merge request URL to clone context", async () => {
    loadGitLabPipesAccessTokenMock.mockResolvedValue(ok("oauth-token"));
    getGitLabProjectMock.mockResolvedValue(
      ok({
        id: 11,
        name: "web",
        pathWithNamespace: "acme/platform/web",
        defaultBranch: "main",
        httpUrlToRepo: "https://gitlab.com/acme/platform/web.git",
        archived: false,
      }),
    );
    getGitLabMergeRequestMock.mockResolvedValue(
      ok({
        iid: 42,
        sourceBranch: "fix-copy",
        commitSha: "abc123",
      }),
    );

    await expect(
      resolveConversationRepositoryGitLabContext({
        organizationId: "org-local",
        workosUserId: "user_workos",
        text: "Review https://gitlab.com/acme/platform/web/-/merge_requests/42",
      }),
    ).resolves.toEqual({
      status: "resolved",
      context: {
        resolved: true,
        provider: "gitlab",
        projectId: 11,
        repositoryFullName: "acme/platform/web",
        httpUrlToRepo: "https://gitlab.com/acme/platform/web.git",
        mergeRequestIid: 42,
        branch: "fix-copy",
        commitSha: "abc123",
      },
    });
  });

  it("is not applicable without a GitLab URL or connected user", async () => {
    await expect(
      resolveConversationRepositoryGitLabContext({
        organizationId: "org-local",
        text: "where is the login copy?",
      }),
    ).resolves.toEqual({ status: "not_applicable" });
  });

  describe("with a workspace's own server", () => {
    const project = {
      id: 7,
      name: "web",
      pathWithNamespace: "acme/web",
      defaultBranch: "main",
      httpUrlToRepo: "https://git.acme.example/acme/web.git",
      archived: false,
    };

    beforeEach(() => {
      getGitLabConnectionMock.mockResolvedValue({ serverUrl: "https://git.acme.example" });
      loadGitLabConnectionCredentialsMock.mockResolvedValue(
        ok({ baseUrl: "https://git.acme.example", accessToken: "server-token" }),
      );
      getGitLabProjectMock.mockResolvedValue(ok(project));
    });

    it("resolves its links with its token, without a connected person", async () => {
      const result = await resolveConversationRepositoryGitLabContext({
        organizationId: "org_1",
        text: "Check https://git.acme.example/acme/web please",
      });

      expect(result).toMatchObject({
        status: "resolved",
        context: { repositoryFullName: "acme/web" },
      });
      expect(getGitLabProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "server-token",
          baseUrl: "https://git.acme.example",
        }),
      );
      expect(loadGitLabPipesAccessTokenMock).not.toHaveBeenCalled();
    });

    it("explains that GitLab.com links aren't used, without looking them up", async () => {
      const result = await resolveConversationRepositoryGitLabContext({
        organizationId: "org_1",
        workosUserId: "user_1",
        text: "Check https://gitlab.com/acme/web please",
      });

      expect(result).toMatchObject({
        status: "unresolved",
        followUp: expect.stringContaining("https://git.acme.example"),
      });
      expect(getGitLabProjectMock).not.toHaveBeenCalled();
    });

    it("only replies about a GitLab.com link in the latest message", async () => {
      const result = await resolveConversationRepositoryGitLabContext({
        organizationId: "org_1",
        text: "Earlier: https://gitlab.com/acme/web\nNow: it's acme/web on our server",
        currentText: "it's acme/web on our server",
      });

      expect(result).toEqual({ status: "not_applicable" });
    });

    it.each([
      [
        "gitlab_connection_decrypt_failed",
        "Unable to read the saved GitLab token.",
        "An admin or localization manager",
      ],
      ["gitlab_not_found", "GitLab could not find that project.", "can't see that project"],
    ])("explains %s in the workspace's terms", async (code, message, reply) => {
      getGitLabProjectMock.mockResolvedValue(err({ code, message }));

      const result = await resolveConversationRepositoryGitLabContext({
        organizationId: "org_1",
        text: "Check https://git.acme.example/acme/web please",
      });

      expect(result).toMatchObject({
        status: "unresolved",
        followUp: expect.stringContaining(reply),
      });
    });

    it("tells people a broken connection needs an admin, not a new connection", async () => {
      getGitLabProjectMock.mockResolvedValue(
        err({
          code: "gitlab_unauthorized",
          message: "GitLab rejected the connected account token.",
        }),
      );

      const result = await resolveConversationRepositoryGitLabContext({
        organizationId: "org_1",
        text: "Check https://git.acme.example/acme/web please",
      });

      expect(result).toMatchObject({
        status: "unresolved",
        followUp: expect.stringContaining("An admin or localization manager"),
      });
    });
  });
});
