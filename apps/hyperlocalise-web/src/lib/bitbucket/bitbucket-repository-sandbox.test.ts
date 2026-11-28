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

const { createVercelSandboxWorkspaceMock, loadBitbucketAccessMock } = vi.hoisted(() => ({
  createVercelSandboxWorkspaceMock: vi.fn(),
  loadBitbucketAccessMock: vi.fn(),
}));

vi.mock("@/lib/agent-runtime/workspaces/vercel-sandbox-runtime", () => ({
  createVercelSandboxWorkspace: createVercelSandboxWorkspaceMock,
  stopWorkspace: vi.fn(),
}));

vi.mock("./pipes", () => ({
  loadBitbucketAccess: loadBitbucketAccessMock,
}));

import { err, ok } from "@/lib/primitives/result/results";

import { createBitbucketRepositorySandbox } from "./bitbucket-repository-sandbox";

const context = {
  resolved: true as const,
  provider: "bitbucket" as const,
  repositoryUuid: "{repo-uuid}",
  repositoryFullName: "acme/web",
};

describe("createBitbucketRepositorySandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createVercelSandboxWorkspaceMock.mockResolvedValue({ id: "sbx_bitbucket" });
  });

  it("clones from bitbucket.org with the workspace's token", async () => {
    loadBitbucketAccessMock.mockResolvedValue(ok({ accessToken: "workspace-token" }));

    await expect(
      createBitbucketRepositorySandbox({
        localOrganizationId: "org_1",
        bitbucketContext: { ...context, branch: "feature/copy" },
      }),
    ).resolves.toBe("sbx_bitbucket");

    expect(loadBitbucketAccessMock).toHaveBeenCalledWith({ localOrganizationId: "org_1" });
    expect(createVercelSandboxWorkspaceMock).toHaveBeenCalledWith({
      source: {
        type: "git",
        url: "https://bitbucket.org/acme/web.git",
        revision: "feature/copy",
        depth: 1,
        username: "x-token-auth",
        password: "workspace-token",
      },
    });
  });

  it("clones HEAD when the context names no branch", async () => {
    loadBitbucketAccessMock.mockResolvedValue(ok({ accessToken: "workspace-token" }));

    await createBitbucketRepositorySandbox({
      localOrganizationId: "org_1",
      bitbucketContext: context,
      cloneDepth: 50,
      timeoutMs: 1000,
    });

    expect(createVercelSandboxWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ revision: "HEAD", depth: 50 }),
        timeoutMs: 1000,
      }),
    );
  });

  it("never builds a clone URL from a full name with more than a workspace and slug", async () => {
    loadBitbucketAccessMock.mockResolvedValue(ok({ accessToken: "workspace-token" }));

    await expect(
      createBitbucketRepositorySandbox({
        localOrganizationId: "org_1",
        bitbucketContext: { ...context, repositoryFullName: "evil.example/../acme/web" },
      }),
    ).rejects.toThrow("bitbucket_not_found");

    expect(loadBitbucketAccessMock).not.toHaveBeenCalled();
    expect(createVercelSandboxWorkspaceMock).not.toHaveBeenCalled();
  });

  it("throws a stable error code when Bitbucket isn't connected", async () => {
    loadBitbucketAccessMock.mockResolvedValue(
      err({ code: "bitbucket_not_connected", message: "Connect Bitbucket" }),
    );

    await expect(
      createBitbucketRepositorySandbox({ localOrganizationId: "org_1", bitbucketContext: context }),
    ).rejects.toThrow("bitbucket_not_connected");
    expect(createVercelSandboxWorkspaceMock).not.toHaveBeenCalled();
  });
});
