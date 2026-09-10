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

const { createVercelSandboxWorkspaceMock, loadGitLabCloneCredentialsMock } = vi.hoisted(() => ({
  createVercelSandboxWorkspaceMock: vi.fn(),
  loadGitLabCloneCredentialsMock: vi.fn(),
}));

vi.mock("@/lib/agent-runtime/workspaces/vercel-sandbox-runtime", () => ({
  createVercelSandboxWorkspace: createVercelSandboxWorkspaceMock,
  stopWorkspace: vi.fn(),
}));

vi.mock("./credentials", () => ({
  loadGitLabCloneCredentials: loadGitLabCloneCredentialsMock,
}));

import { err, ok } from "@/lib/primitives/result/results";

import { createGitlabRepositorySandbox } from "./gitlab-repository-sandbox";

describe("createGitlabRepositorySandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clones with oauth2 credentials and the Pipes access token", async () => {
    loadGitLabCloneCredentialsMock.mockResolvedValue(
      ok({ accessToken: "oauth-token", apiOrigin: "https://gitlab.com", connectionId: null }),
    );
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

  it("clones a self-hosted project with the connection token", async () => {
    loadGitLabCloneCredentialsMock.mockResolvedValue(
      ok({
        accessToken: "glpat-self-hosted",
        apiOrigin: "https://gitlab.acme.example",
        connectionId: "11111111-1111-4111-8111-111111111111",
      }),
    );
    createVercelSandboxWorkspaceMock.mockResolvedValue({ id: "sbx_self_hosted" });

    await expect(
      createGitlabRepositorySandbox({
        localOrganizationId: "org-local",
        gitlabContext: {
          resolved: true,
          provider: "gitlab",
          projectId: 22,
          repositoryFullName: "acme/web",
          httpUrlToRepo: "https://gitlab.acme.example/acme/web.git",
          instanceOrigin: "https://gitlab.acme.example",
          connectionId: "11111111-1111-4111-8111-111111111111",
          branch: "main",
        },
      }),
    ).resolves.toBe("sbx_self_hosted");

    expect(createVercelSandboxWorkspaceMock).toHaveBeenCalledWith({
      source: {
        type: "git",
        url: "https://gitlab.acme.example/acme/web.git",
        revision: "main",
        depth: 1,
        username: "oauth2",
        password: "glpat-self-hosted",
      },
    });
  });

  it("throws a stable error code when GitLab is not connected", async () => {
    loadGitLabCloneCredentialsMock.mockResolvedValue(
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
