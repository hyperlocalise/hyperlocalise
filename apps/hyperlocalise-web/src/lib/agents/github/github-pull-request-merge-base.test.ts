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

const { getInstallationOctokitMock } = vi.hoisted(() => ({
  getInstallationOctokitMock: vi.fn(),
}));

vi.mock("@/lib/agents/github/app", () => ({
  getInstallationOctokit: getInstallationOctokitMock,
}));

import {
  parseGithubRepositoryFullName,
  resolveGithubPullRequestMergeBaseSha,
} from "./github-pull-request-merge-base";

describe("parseGithubRepositoryFullName", () => {
  it("reads owner and repository from a full name", () => {
    expect(parseGithubRepositoryFullName("acme/app")).toEqual({ owner: "acme", repo: "app" });
    expect(parseGithubRepositoryFullName("acme")).toBeNull();
  });
});

describe("resolveGithubPullRequestMergeBaseSha", () => {
  beforeEach(() => {
    getInstallationOctokitMock.mockReset();
  });

  it("returns the compare API merge base", async () => {
    const compareCommits = vi.fn().mockResolvedValue({
      data: { merge_base_commit: { sha: "merge111" } },
    });
    getInstallationOctokitMock.mockResolvedValue({
      rest: { repos: { compareCommits } },
    });

    await expect(
      resolveGithubPullRequestMergeBaseSha({
        githubInstallationId: "123",
        repositoryFullName: "acme/app",
        base: "main",
        head: "bbb222",
      }),
    ).resolves.toBe("merge111");

    expect(compareCommits).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      base: "main",
      head: "bbb222",
    });
  });

  it("returns null when compare fails", async () => {
    getInstallationOctokitMock.mockResolvedValue({
      rest: {
        repos: {
          compareCommits: vi.fn().mockRejectedValue(new Error("not found")),
        },
      },
    });

    await expect(
      resolveGithubPullRequestMergeBaseSha({
        githubInstallationId: "123",
        repositoryFullName: "acme/app",
        base: "main",
        head: "bbb222",
      }),
    ).resolves.toBeNull();
  });
});

describe("resolveGithubPullRequestReviewBaseSha", () => {
  beforeEach(() => {
    getInstallationOctokitMock.mockReset();
  });

  it("falls back to the pull request base tip when compare has no merge base", async () => {
    const compareCommits = vi.fn().mockResolvedValue({ data: {} });
    const get = vi.fn().mockResolvedValue({
      data: { base: { ref: "main", sha: "aaa111" } },
    });
    getInstallationOctokitMock.mockResolvedValue({
      rest: {
        pulls: { get },
        repos: { compareCommits },
      },
    });

    const { resolveGithubPullRequestReviewBaseSha } =
      await import("./github-pull-request-merge-base");
    await expect(
      resolveGithubPullRequestReviewBaseSha({
        githubInstallationId: "123",
        repositoryFullName: "acme/app",
        pullRequestNumber: 42,
        headSha: "bbb222",
      }),
    ).resolves.toBe("aaa111");
  });
});
