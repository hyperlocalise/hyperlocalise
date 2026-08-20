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
  buildWorkspaceAutomationGithubCommentMarker,
  commentContainsWorkspaceAutomationMarker,
  formatWorkspaceAutomationGithubCommentBody,
  upsertWorkspaceAutomationPullRequestComment,
} from "./upsert-workspace-automation-pull-request-comment";

describe("workspace automation GitHub comment helpers", () => {
  it("builds a stable HTML marker for sticky comments", () => {
    expect(buildWorkspaceAutomationGithubCommentMarker("auto-1")).toBe(
      "<!-- hyperlocalise-automation:auto-1 -->",
    );
    expect(
      commentContainsWorkspaceAutomationMarker(
        "<!-- hyperlocalise-automation:auto-1 -->\nHello",
        "auto-1",
      ),
    ).toBe(true);
    expect(
      commentContainsWorkspaceAutomationMarker(
        "<!-- hyperlocalise-automation:other -->\nHello",
        "auto-1",
      ),
    ).toBe(false);
  });

  it("prefixes the message with the marker and truncates oversized bodies", () => {
    const formatted = formatWorkspaceAutomationGithubCommentBody({
      automationId: "auto-1",
      message: "  Finding one.  ",
    });
    expect(formatted.startsWith("<!-- hyperlocalise-automation:auto-1 -->\n")).toBe(true);
    expect(formatted).toContain("Finding one.");

    const oversized = formatWorkspaceAutomationGithubCommentBody({
      automationId: "auto-1",
      message: "x".repeat(70_000),
    });
    expect(oversized.length).toBeLessThanOrEqual(65_536);
    expect(oversized).toContain("_(Comment truncated.)_");
  });
});

describe("upsertWorkspaceAutomationPullRequestComment", () => {
  const listPullRequestsAssociatedWithCommit = vi.fn();
  const listComments = vi.fn();
  const createComment = vi.fn();
  const updateComment = vi.fn();
  const paginate = vi.fn();

  beforeEach(() => {
    listPullRequestsAssociatedWithCommit.mockReset();
    listComments.mockReset();
    createComment.mockReset();
    updateComment.mockReset();
    paginate.mockReset();
    getInstallationOctokitMock.mockReset();
    getInstallationOctokitMock.mockResolvedValue({
      paginate,
      rest: {
        repos: { listPullRequestsAssociatedWithCommit },
        issues: { listComments, createComment, updateComment },
      },
    });
  });

  it("skips when the commit SHA is missing or a GitHub null OID", async () => {
    await expect(
      upsertWorkspaceAutomationPullRequestComment({
        installationId: "1",
        repositoryFullName: "acme/app",
        automationId: "auto-1",
        commitSha: "0000000000000000000000000000000000000000",
        message: "Review",
      }),
    ).resolves.toEqual({
      ok: true,
      value: { status: "skipped", code: "github_commit_not_found" },
    });
    expect(getInstallationOctokitMock).not.toHaveBeenCalled();
  });

  it("skips when no pull request is associated with the commit", async () => {
    listPullRequestsAssociatedWithCommit.mockResolvedValue({ data: [] });

    await expect(
      upsertWorkspaceAutomationPullRequestComment({
        installationId: "1",
        repositoryFullName: "acme/app",
        automationId: "auto-1",
        commitSha: "abc123",
        message: "Review",
      }),
    ).resolves.toEqual({
      ok: true,
      value: { status: "skipped", code: "github_pr_not_found" },
    });
    expect(createComment).not.toHaveBeenCalled();
  });

  it("uses an explicit pull request number without looking up associated commits", async () => {
    paginate.mockResolvedValue([]);
    createComment.mockResolvedValue({
      data: { id: 55, html_url: "https://github.com/acme/app/pull/42#issuecomment-55" },
    });

    const result = await upsertWorkspaceAutomationPullRequestComment({
      installationId: "1",
      repositoryFullName: "acme/app",
      automationId: "auto-1",
      commitSha: "abc123",
      pullRequestNumber: 42,
      message: "PR review",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        status: "created",
        pullRequestNumber: 42,
        commentId: 55,
        url: "https://github.com/acme/app/pull/42#issuecomment-55",
      },
    });
    expect(listPullRequestsAssociatedWithCommit).not.toHaveBeenCalled();
    expect(createComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      issue_number: 42,
      body: "<!-- hyperlocalise-automation:auto-1 -->\nPR review",
    });
  });

  it("creates a sticky comment on the preferred open pull request", async () => {
    listPullRequestsAssociatedWithCommit.mockResolvedValue({
      data: [
        { number: 8, state: "closed", updated_at: "2026-08-18T12:00:00Z" },
        { number: 12, state: "open", updated_at: "2026-08-18T10:00:00Z" },
        { number: 9, state: "open", updated_at: "2026-08-18T11:00:00Z" },
      ],
    });
    paginate.mockResolvedValue([]);
    createComment.mockResolvedValue({
      data: { id: 44, html_url: "https://github.com/acme/app/pull/9#issuecomment-44" },
    });

    const result = await upsertWorkspaceAutomationPullRequestComment({
      installationId: "1",
      repositoryFullName: "acme/app",
      automationId: "auto-1",
      commitSha: "abc123",
      message: "**Blocker** found",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        status: "created",
        pullRequestNumber: 9,
        commentId: 44,
        url: "https://github.com/acme/app/pull/9#issuecomment-44",
      },
    });
    expect(createComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      issue_number: 9,
      body: "<!-- hyperlocalise-automation:auto-1 -->\n**Blocker** found",
    });
  });

  it("updates the existing sticky comment instead of posting a new one", async () => {
    listPullRequestsAssociatedWithCommit.mockResolvedValue({
      data: [{ number: 3, state: "open", updated_at: "2026-08-18T11:00:00Z" }],
    });
    paginate.mockResolvedValue([
      { id: 21, body: "unrelated" },
      { id: 22, body: "<!-- hyperlocalise-automation:auto-1 -->\nOld review" },
    ]);
    updateComment.mockResolvedValue({
      data: { id: 22, html_url: "https://github.com/acme/app/pull/3#issuecomment-22" },
    });

    const result = await upsertWorkspaceAutomationPullRequestComment({
      installationId: "1",
      repositoryFullName: "acme/app",
      automationId: "auto-1",
      commitSha: "abc123",
      message: "Updated review",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        status: "updated",
        pullRequestNumber: 3,
        commentId: 22,
        url: "https://github.com/acme/app/pull/3#issuecomment-22",
      },
    });
    expect(createComment).not.toHaveBeenCalled();
    expect(updateComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      comment_id: 22,
      body: "<!-- hyperlocalise-automation:auto-1 -->\nUpdated review",
    });
  });

  it("returns a send failure when GitHub rejects the request", async () => {
    listPullRequestsAssociatedWithCommit.mockRejectedValue(new Error("API rate limited"));

    await expect(
      upsertWorkspaceAutomationPullRequestComment({
        installationId: "1",
        repositoryFullName: "acme/app",
        automationId: "auto-1",
        commitSha: "abc123",
        message: "Review",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "github_comment_send_failed",
        message: "API rate limited",
      },
    });
  });
});
