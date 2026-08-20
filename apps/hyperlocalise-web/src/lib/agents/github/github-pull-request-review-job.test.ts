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

import { ok } from "@/lib/primitives/result/results";

const {
  createGithubRepositoryAutomationSandboxMock,
  resolveGithubPullRequestReviewBaseShaMock,
  runGitDiffInSandboxMock,
  runGithubPullRequestReviewAgentMock,
  stopGithubRepositoryAutomationSandboxMock,
  upsertWorkspaceAutomationPullRequestCommentMock,
} = vi.hoisted(() => ({
  createGithubRepositoryAutomationSandboxMock: vi.fn(),
  resolveGithubPullRequestReviewBaseShaMock: vi.fn(),
  runGitDiffInSandboxMock: vi.fn(),
  runGithubPullRequestReviewAgentMock: vi.fn(),
  stopGithubRepositoryAutomationSandboxMock: vi.fn(),
  upsertWorkspaceAutomationPullRequestCommentMock: vi.fn(),
}));

vi.mock("@/lib/agents/github/github-auto-review-settings", () => ({
  GITHUB_AUTO_REVIEW_COMMENT_AUTOMATION_ID: "auto-review",
}));

vi.mock("@/lib/agents/github/github-pull-request-merge-base", () => ({
  resolveGithubPullRequestReviewBaseSha: resolveGithubPullRequestReviewBaseShaMock,
}));

vi.mock("@/lib/agents/github/github-repository-automation-agent", () => ({
  runGithubPullRequestReviewAgent: runGithubPullRequestReviewAgentMock,
}));

vi.mock("@/lib/agents/github/github-repository-automation-sandbox", () => ({
  createGithubRepositoryAutomationSandbox: createGithubRepositoryAutomationSandboxMock,
  runGitDiffInSandbox: runGitDiffInSandboxMock,
  stopGithubRepositoryAutomationSandbox: stopGithubRepositoryAutomationSandboxMock,
}));

vi.mock("@/lib/agents/github/upsert-workspace-automation-pull-request-comment", () => ({
  upsertWorkspaceAutomationPullRequestComment: upsertWorkspaceAutomationPullRequestCommentMock,
}));

import { runGithubPullRequestReviewJob } from "./github-pull-request-review-job";

describe("runGithubPullRequestReviewJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGithubRepositoryAutomationSandboxMock.mockResolvedValue("sandbox_123");
    runGitDiffInSandboxMock
      .mockResolvedValueOnce({ output: "locales/en.json" })
      .mockResolvedValueOnce({ output: "diff --git a/locales/en.json" });
    runGithubPullRequestReviewAgentMock.mockResolvedValue("P0: missing translation.");
    upsertWorkspaceAutomationPullRequestCommentMock.mockResolvedValue(
      ok({ status: "updated", pullRequestNumber: 42, commentId: 1, url: "https://example" }),
    );
  });

  it("reviews the pull request diff and upserts the sticky comment", async () => {
    await expect(
      runGithubPullRequestReviewJob({
        organizationId: "org_123",
        githubInstallationId: "123",
        repositoryFullName: "acme/app",
        pullRequestNumber: 42,
        headSha: "head",
        baseSha: "base",
        additionalPrompt: "Focus on ICU.",
        trigger: "auto_review",
      }),
    ).resolves.toEqual({ ok: true, summary: "P0: missing translation." });

    expect(createGithubRepositoryAutomationSandboxMock).toHaveBeenCalledWith({
      installationId: "123",
      repositoryFullName: "acme/app",
      revision: "head",
      cloneDepth: 50,
    });
    expect(resolveGithubPullRequestReviewBaseShaMock).not.toHaveBeenCalled();
    expect(runGithubPullRequestReviewAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        changedPaths: ["locales/en.json"],
        additionalPrompt: "Focus on ICU.",
        baseSha: "base",
      }),
    );
    expect(upsertWorkspaceAutomationPullRequestCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        automationId: "auto-review",
        message: "P0: missing translation.",
      }),
    );
    expect(stopGithubRepositoryAutomationSandboxMock).toHaveBeenCalledWith("sandbox_123");
  });
});
