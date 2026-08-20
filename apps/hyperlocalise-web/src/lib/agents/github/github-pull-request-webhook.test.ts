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
  dispatchWorkspaceAutomationsForGithubPullRequestMock,
  enqueueGithubPullRequestReviewMock,
  loggerErrorMock,
  loggerInfoMock,
  resolveGithubPullRequestMergeBaseShaMock,
} = vi.hoisted(() => ({
  dispatchWorkspaceAutomationsForGithubPullRequestMock: vi.fn(),
  enqueueGithubPullRequestReviewMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  resolveGithubPullRequestMergeBaseShaMock: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    error: loggerErrorMock,
    info: loggerInfoMock,
  })),
}));

vi.mock("../workspace-automation-dispatcher", () => ({
  dispatchWorkspaceAutomationsForGithubPullRequest:
    dispatchWorkspaceAutomationsForGithubPullRequestMock,
}));

vi.mock("./github-pull-request-merge-base", () => ({
  resolveGithubPullRequestMergeBaseSha: resolveGithubPullRequestMergeBaseShaMock,
}));

vi.mock("./github-pull-request-review", () => ({
  enqueueGithubPullRequestReview: enqueueGithubPullRequestReviewMock,
}));

import {
  handleGithubPullRequestWebhook,
  shouldDispatchGithubPullRequestAction,
} from "./github-pull-request-webhook";

describe("shouldDispatchGithubPullRequestAction", () => {
  it("dispatches opened, reopened, synchronize, and ready_for_review", () => {
    expect(shouldDispatchGithubPullRequestAction("opened", { draft: false })).toBe(true);
    expect(shouldDispatchGithubPullRequestAction("reopened", { draft: false })).toBe(true);
    expect(shouldDispatchGithubPullRequestAction("synchronize", { draft: false })).toBe(true);
    expect(shouldDispatchGithubPullRequestAction("ready_for_review", { draft: true })).toBe(true);
  });

  it("ignores drafts, merged PRs, and unrelated actions", () => {
    expect(shouldDispatchGithubPullRequestAction("opened", { draft: true })).toBe(false);
    expect(shouldDispatchGithubPullRequestAction("opened", { merged: true })).toBe(false);
    expect(shouldDispatchGithubPullRequestAction("closed", { draft: false })).toBe(false);
    expect(shouldDispatchGithubPullRequestAction("edited", { draft: false })).toBe(false);
  });
});

describe("handleGithubPullRequestWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchWorkspaceAutomationsForGithubPullRequestMock.mockResolvedValue([]);
    enqueueGithubPullRequestReviewMock.mockResolvedValue({
      outcome: "skipped",
      reason: "auto_review_not_enabled",
    });
    resolveGithubPullRequestMergeBaseShaMock.mockResolvedValue("merge111");
  });

  it("dispatches workspace automations for an opened pull request against main", async () => {
    await expect(
      handleGithubPullRequestWebhook({
        deliveryId: "delivery-pr-1",
        organizationId: "org_123",
        githubInstallationId: "123",
        githubInstallationRepositoryId: "installation-repo-123",
        githubRepositoryId: "repo-123",
        repositoryFullName: "acme/app",
        payload: {
          action: "opened",
          pull_request: {
            number: 42,
            html_url: "https://github.com/acme/app/pull/42",
            draft: false,
            base: { ref: "main", sha: "aaa111" },
            head: { ref: "feature/review", sha: "bbb222" },
          },
        },
      }),
    ).resolves.toEqual({ ignored: false });

    expect(resolveGithubPullRequestMergeBaseShaMock).toHaveBeenCalledWith({
      githubInstallationId: "123",
      repositoryFullName: "acme/app",
      base: "main",
      head: "bbb222",
    });
    expect(dispatchWorkspaceAutomationsForGithubPullRequestMock).toHaveBeenCalledWith({
      deliveryId: "delivery-pr-1",
      organizationId: "org_123",
      githubInstallationRepositoryId: "installation-repo-123",
      action: "opened",
      pullRequestNumber: 42,
      pullRequestUrl: "https://github.com/acme/app/pull/42",
      baseBranch: "main",
      headBranch: "feature/review",
      commitBefore: "merge111",
      commitAfter: "bbb222",
    });
    expect(enqueueGithubPullRequestReviewMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      githubInstallationId: "123",
      githubInstallationRepositoryId: "installation-repo-123",
      repositoryFullName: "acme/app",
      pullRequestNumber: 42,
      headSha: "bbb222",
      baseSha: "merge111",
      trigger: "auto_review",
    });
  });

  it("falls back to the base tip when the merge base cannot be resolved", async () => {
    resolveGithubPullRequestMergeBaseShaMock.mockResolvedValueOnce(null);

    await expect(
      handleGithubPullRequestWebhook({
        deliveryId: "delivery-pr-fallback",
        organizationId: "org_123",
        githubInstallationId: "123",
        githubInstallationRepositoryId: "installation-repo-123",
        githubRepositoryId: "repo-123",
        repositoryFullName: "acme/app",
        payload: {
          action: "opened",
          pull_request: {
            number: 8,
            draft: false,
            base: { ref: "main", sha: "aaa111" },
            head: { ref: "feature/x", sha: "bbb222" },
          },
        },
      }),
    ).resolves.toEqual({ ignored: false });

    expect(dispatchWorkspaceAutomationsForGithubPullRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commitBefore: "aaa111",
        commitAfter: "bbb222",
      }),
    );
  });

  it("ignores draft pull requests without failing the webhook", async () => {
    await expect(
      handleGithubPullRequestWebhook({
        deliveryId: "delivery-pr-draft",
        organizationId: "org_123",
        githubInstallationId: "123",
        githubInstallationRepositoryId: "installation-repo-123",
        githubRepositoryId: "repo-123",
        repositoryFullName: "acme/app",
        payload: {
          action: "opened",
          pull_request: {
            number: 7,
            draft: true,
            base: { ref: "main", sha: "aaa111" },
            head: { ref: "feature/draft", sha: "bbb222" },
          },
        },
      }),
    ).resolves.toEqual({ ignored: true });

    expect(dispatchWorkspaceAutomationsForGithubPullRequestMock).not.toHaveBeenCalled();
  });

  it("does not fail the webhook when workspace automation dispatch fails", async () => {
    dispatchWorkspaceAutomationsForGithubPullRequestMock.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(
      handleGithubPullRequestWebhook({
        deliveryId: "delivery-pr-2",
        organizationId: "org_123",
        githubInstallationId: "123",
        githubInstallationRepositoryId: "installation-repo-123",
        githubRepositoryId: "repo-123",
        repositoryFullName: "acme/app",
        payload: {
          action: "opened",
          pull_request: {
            number: 9,
            draft: false,
            base: { ref: "main", sha: "aaa111" },
            head: { ref: "feature/x", sha: "bbb222" },
          },
        },
      }),
    ).resolves.toEqual({ ignored: false });

    expect(loggerErrorMock).toHaveBeenCalledWith(
      {
        deliveryId: "delivery-pr-2",
        error: "database unavailable",
        repositoryId: "repo-123",
      },
      "workspace automations github pull request dispatch failed",
    );
    expect(enqueueGithubPullRequestReviewMock).toHaveBeenCalled();
  });
});
