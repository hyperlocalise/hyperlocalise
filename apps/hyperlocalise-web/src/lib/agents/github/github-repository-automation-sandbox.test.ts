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

const { getInstallationOctokitMock, runSandboxCommandMock } = vi.hoisted(() => ({
  getInstallationOctokitMock: vi.fn(),
  runSandboxCommandMock: vi.fn(),
}));

vi.mock("@/lib/agents/github/app", () => ({
  getInstallationOctokit: getInstallationOctokitMock,
}));

vi.mock("@/lib/translation/sandbox", () => ({
  prepareSandbox: vi.fn(),
  runSandboxCommand: (...args: unknown[]) => runSandboxCommandMock(...args),
}));

vi.mock("@/lib/agent-runtime/workspaces/vercel-sandbox-runtime", () => ({
  createVercelSandboxWorkspace: vi.fn(),
  stopWorkspace: vi.fn(),
}));

import {
  checkoutCommitInSandbox,
  prepareGithubRepositoryAutomationSandboxForPush,
  resolveDefaultBranchHeadSha,
} from "./github-repository-automation-sandbox";

describe("resolveDefaultBranchHeadSha", () => {
  beforeEach(() => {
    getInstallationOctokitMock.mockReset();
  });

  it("returns the requested branch head SHA", async () => {
    const get = vi.fn().mockResolvedValue({ data: { default_branch: "main" } });
    const getRef = vi.fn().mockResolvedValue({ data: { object: { sha: "abc123" } } });
    getInstallationOctokitMock.mockResolvedValue({
      rest: { repos: { get }, git: { getRef } },
    });

    await expect(
      resolveDefaultBranchHeadSha({
        installationId: "42",
        owner: "acme",
        repo: "app",
        branch: "release",
      }),
    ).resolves.toEqual({ branch: "release", sha: "abc123" });

    expect(getRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      ref: "heads/release",
    });
  });

  it("falls back to the repository default branch when branch is omitted", async () => {
    const get = vi.fn().mockResolvedValue({ data: { default_branch: "trunk" } });
    const getRef = vi.fn().mockResolvedValue({ data: { object: { sha: "def456" } } });
    getInstallationOctokitMock.mockResolvedValue({
      rest: { repos: { get }, git: { getRef } },
    });

    await expect(
      resolveDefaultBranchHeadSha({
        installationId: "42",
        owner: "acme",
        repo: "app",
      }),
    ).resolves.toEqual({ branch: "trunk", sha: "def456" });

    expect(getRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      ref: "heads/trunk",
    });
  });
});

describe("checkoutCommitInSandbox", () => {
  beforeEach(() => {
    runSandboxCommandMock.mockReset();
  });

  it("checks out the commit with --force", async () => {
    runSandboxCommandMock.mockResolvedValue({ exitCode: 0, output: "" });

    await checkoutCommitInSandbox("sandbox-1", "abc123");

    expect(runSandboxCommandMock).toHaveBeenCalledWith("sandbox-1", "git", [
      "checkout",
      "--force",
      "abc123",
    ]);
  });

  it("throws when checkout fails", async () => {
    runSandboxCommandMock.mockResolvedValue({ exitCode: 1, output: "conflict" });

    await expect(checkoutCommitInSandbox("sandbox-1", "abc123")).rejects.toThrow(
      "git checkout failed for commit abc123",
    );
  });
});

describe("prepareGithubRepositoryAutomationSandboxForPush", () => {
  beforeEach(() => {
    getInstallationOctokitMock.mockReset();
    runSandboxCommandMock.mockReset();
  });

  it("configures git identity, credentials, and origin remote for push", async () => {
    getInstallationOctokitMock.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ token: "ghs_test_token" }),
    });
    runSandboxCommandMock.mockResolvedValue({ exitCode: 0, output: "" });

    await prepareGithubRepositoryAutomationSandboxForPush({
      sandboxId: "sandbox-1",
      installationId: "42",
      repositoryFullName: "acme/app",
    });

    expect(runSandboxCommandMock).toHaveBeenCalledTimes(5);
    expect(runSandboxCommandMock.mock.calls).toEqual([
      ["sandbox-1", "git", ["config", "user.name", "hyperlocalise[bot]"], undefined],
      [
        "sandbox-1",
        "git",
        ["config", "user.email", "hyperlocalise[bot]@users.noreply.github.com"],
        undefined,
      ],
      ["sandbox-1", "git", ["config", "credential.helper", "store"], undefined],
      [
        "sandbox-1",
        "bash",
        [
          "-lc",
          `printf '%s\\n' "https://x-access-token:$GITHUB_TOKEN@github.com" > ~/.git-credentials`,
        ],
        { env: { GITHUB_TOKEN: "ghs_test_token" } },
      ],
      [
        "sandbox-1",
        "git",
        ["remote", "set-url", "origin", "https://github.com/acme/app.git"],
        undefined,
      ],
    ]);
  });

  it("throws when a setup command fails", async () => {
    getInstallationOctokitMock.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ token: "ghs_test_token" }),
    });
    runSandboxCommandMock
      .mockResolvedValueOnce({ exitCode: 0, output: "" })
      .mockResolvedValueOnce({ exitCode: 1, output: "permission denied" });

    await expect(
      prepareGithubRepositoryAutomationSandboxForPush({
        sandboxId: "sandbox-1",
        installationId: "42",
        repositoryFullName: "acme/app",
      }),
    ).rejects.toThrow("sandbox git setup failed: permission denied");

    expect(runSandboxCommandMock).toHaveBeenCalledTimes(2);
  });
});
