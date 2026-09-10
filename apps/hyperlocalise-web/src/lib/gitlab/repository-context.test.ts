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

const { loadGitLabPipesAccessTokenMock, getGitLabProjectMock, getGitLabMergeRequestMock } =
  vi.hoisted(() => ({
    loadGitLabPipesAccessTokenMock: vi.fn(),
    getGitLabProjectMock: vi.fn(),
    getGitLabMergeRequestMock: vi.fn(),
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
});
