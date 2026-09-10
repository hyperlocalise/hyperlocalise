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

const { createVercelSandboxWorkspaceMock, loadGitLabPipesAccessTokenMock } = vi.hoisted(() => ({
  createVercelSandboxWorkspaceMock: vi.fn(),
  loadGitLabPipesAccessTokenMock: vi.fn(),
}));

vi.mock("@/lib/agent-runtime/workspaces/vercel-sandbox-runtime", () => ({
  createVercelSandboxWorkspace: createVercelSandboxWorkspaceMock,
  stopWorkspace: vi.fn(),
}));

vi.mock("./pipes", () => ({
  loadGitLabPipesAccessToken: loadGitLabPipesAccessTokenMock,
}));

import { err, ok } from "@/lib/primitives/result/results";

import { createGitlabRepositorySandbox } from "./gitlab-repository-sandbox";

describe("createGitlabRepositorySandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clones with oauth2 credentials and the Pipes access token", async () => {
    loadGitLabPipesAccessTokenMock.mockResolvedValue(ok("oauth-token"));
    createVercelSandboxWorkspaceMock.mockResolvedValue({ id: "sbx_gitlab" });

    await expect(
      createGitlabRepositorySandbox({
        localOrganizationId: "org-local",
        workosUserId: "user_workos",
        gitlabContext: {
          resolved: true,
          provider: "gitlab",
          projectId: 11,
          repositoryFullName: "acme/web",
          httpUrlToRepo: "https://gitlab.com/acme/web.git",
          branch: "main",
        },
      }),
    ).resolves.toBe("sbx_gitlab");

    expect(createVercelSandboxWorkspaceMock).toHaveBeenCalledWith({
      source: {
        type: "git",
        url: "https://gitlab.com/acme/web.git",
        revision: "main",
        depth: 1,
        username: "oauth2",
        password: "oauth-token",
      },
    });
  });

  it("throws a stable error code when GitLab is not connected", async () => {
    loadGitLabPipesAccessTokenMock.mockResolvedValue(
      err({ code: "gitlab_not_connected", message: "Connect GitLab" }),
    );

    await expect(
      createGitlabRepositorySandbox({
        localOrganizationId: "org-local",
        workosUserId: "user_workos",
        gitlabContext: {
          resolved: true,
          provider: "gitlab",
          projectId: 11,
          repositoryFullName: "acme/web",
          httpUrlToRepo: "https://gitlab.com/acme/web.git",
        },
      }),
    ).rejects.toThrow("gitlab_not_connected");
  });
});
