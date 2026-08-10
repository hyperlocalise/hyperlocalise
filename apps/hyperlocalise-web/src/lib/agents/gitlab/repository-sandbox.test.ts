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

const { createVercelSandboxWorkspaceMock, getGitlabAccessTokenMock } = vi.hoisted(() => ({
  createVercelSandboxWorkspaceMock: vi.fn(async () => ({ id: "sbx_gitlab" })),
  getGitlabAccessTokenMock: vi.fn(),
}));

vi.mock("@/lib/agent-runtime/workspaces/vercel-sandbox-runtime", () => ({
  createVercelSandboxWorkspace: createVercelSandboxWorkspaceMock,
  stopWorkspace: vi.fn(),
}));

vi.mock("@/lib/agents/gitlab/tokens", () => ({
  getGitlabAccessToken: getGitlabAccessTokenMock,
}));

import { createGitlabRepositorySandbox } from "./repository-sandbox";
import { ok } from "@/lib/primitives/result/results";

describe("createGitlabRepositorySandbox", () => {
  beforeEach(() => {
    createVercelSandboxWorkspaceMock.mockClear();
    getGitlabAccessTokenMock.mockReset();
  });

  it("clones with oauth2 credentials and gitlab https url", async () => {
    getGitlabAccessTokenMock.mockResolvedValue(
      ok({
        accessToken: "glpat-or-oauth",
        baseUrl: "https://gitlab.com",
        connectionId: "conn-1",
      }),
    );

    const sandboxId = await createGitlabRepositorySandbox({
      resolved: true,
      organizationId: "org-1",
      connectionId: "conn-1",
      projectId: "101",
      pathWithNamespace: "acme/app",
      httpUrlToRepo: "https://gitlab.com/acme/app.git",
      branch: "main",
    });

    expect(sandboxId).toBe("sbx_gitlab");
    expect(createVercelSandboxWorkspaceMock).toHaveBeenCalledWith({
      source: {
        type: "git",
        url: "https://gitlab.com/acme/app.git",
        revision: "main",
        depth: 1,
        username: "oauth2",
        password: "glpat-or-oauth",
      },
    });
  });
});
