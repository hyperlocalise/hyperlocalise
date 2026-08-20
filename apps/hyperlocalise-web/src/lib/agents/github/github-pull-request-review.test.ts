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
  claimGitHubAgentRequestMock,
  getGithubAutoReviewSettingsMock,
  isGithubAutoReviewEnabledForRepositoryMock,
  markGitHubAgentRequestEnqueuedMock,
  releaseGitHubAgentRequestClaimMock,
  upsertWorkspaceAutomationPullRequestCommentMock,
} = vi.hoisted(() => ({
  claimGitHubAgentRequestMock: vi.fn(),
  getGithubAutoReviewSettingsMock: vi.fn(),
  isGithubAutoReviewEnabledForRepositoryMock: vi.fn(),
  markGitHubAgentRequestEnqueuedMock: vi.fn(),
  releaseGitHubAgentRequestClaimMock: vi.fn(),
  upsertWorkspaceAutomationPullRequestCommentMock: vi.fn(),
}));

vi.mock("./github-auto-review-settings", () => ({
  GITHUB_AUTO_REVIEW_COMMENT_AUTOMATION_ID: "auto-review",
  getGithubAutoReviewSettings: getGithubAutoReviewSettingsMock,
  isGithubAutoReviewEnabledForRepository: isGithubAutoReviewEnabledForRepositoryMock,
}));

vi.mock("./request-idempotency", () => ({
  buildGitHubPullRequestReviewRequestInput: vi.fn((input: unknown) => input),
  claimGitHubAgentRequest: claimGitHubAgentRequestMock,
  markGitHubAgentRequestEnqueued: markGitHubAgentRequestEnqueuedMock,
  releaseGitHubAgentRequestClaim: releaseGitHubAgentRequestClaimMock,
}));

vi.mock("./upsert-workspace-automation-pull-request-comment", () => ({
  upsertWorkspaceAutomationPullRequestComment: upsertWorkspaceAutomationPullRequestCommentMock,
}));

vi.mock("@/workflows/adapters", () => ({
  createGithubPullRequestReviewQueue: vi.fn(),
}));

import { enqueueGithubPullRequestReview } from "./github-pull-request-review";

describe("enqueueGithubPullRequestReview", () => {
  const queue = { enqueue: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    getGithubAutoReviewSettingsMock.mockResolvedValue({ additionalPrompt: "Focus on ICU." });
    claimGitHubAgentRequestMock.mockResolvedValue({
      alreadyQueued: false,
      requestId: "request_123",
    });
    queue.enqueue.mockResolvedValue({ ids: ["workflow_123"] });
    upsertWorkspaceAutomationPullRequestCommentMock.mockResolvedValue(ok({ status: "created" }));
  });

  it("skips auto-review when the repository is not selected", async () => {
    isGithubAutoReviewEnabledForRepositoryMock.mockResolvedValue(false);

    await expect(
      enqueueGithubPullRequestReview({
        organizationId: "org_123",
        githubInstallationId: "123",
        githubInstallationRepositoryId: "repo_123",
        repositoryFullName: "acme/app",
        pullRequestNumber: 42,
        headSha: "head",
        baseSha: "base",
        trigger: "auto_review",
        queue,
      }),
    ).resolves.toEqual({ outcome: "skipped", reason: "auto_review_not_enabled" });

    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues mention reviews even when auto-review is off", async () => {
    isGithubAutoReviewEnabledForRepositoryMock.mockResolvedValue(false);

    await expect(
      enqueueGithubPullRequestReview({
        organizationId: "org_123",
        githubInstallationId: "123",
        repositoryFullName: "acme/app",
        pullRequestNumber: 42,
        headSha: "head",
        baseSha: "base",
        trigger: "mention",
        commentId: 99,
        queue,
      }),
    ).resolves.toEqual({
      outcome: "enqueued",
      requestId: "request_123",
      workflowRunIds: ["workflow_123"],
    });

    expect(isGithubAutoReviewEnabledForRepositoryMock).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledWith({
      organizationId: "org_123",
      githubInstallationId: "123",
      repositoryFullName: "acme/app",
      pullRequestNumber: 42,
      headSha: "head",
      baseSha: "base",
      additionalPrompt: "Focus on ICU.",
      trigger: "mention",
    });
  });
});
