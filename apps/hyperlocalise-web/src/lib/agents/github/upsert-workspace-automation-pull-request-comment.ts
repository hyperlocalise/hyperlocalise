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
import { getInstallationOctokit } from "@/lib/agents/github/app";
import { err, ok, type Result } from "@/lib/primitives/result/results";

const GITHUB_ISSUE_COMMENT_MAX_LENGTH = 65_536;

export type UpsertWorkspaceAutomationPullRequestCommentSkipCode =
  | "github_pr_not_found"
  | "github_commit_not_found";

export type UpsertWorkspaceAutomationPullRequestCommentSuccess =
  | {
      status: "created" | "updated";
      pullRequestNumber: number;
      commentId: number;
      url: string;
    }
  | {
      status: "skipped";
      code: UpsertWorkspaceAutomationPullRequestCommentSkipCode;
    };

export type UpsertWorkspaceAutomationPullRequestCommentError = {
  code: "github_comment_send_failed" | "invalid_repository_full_name";
  message: string;
};

export function buildWorkspaceAutomationGithubCommentMarker(automationId: string): string {
  return `<!-- hyperlocalise-automation:${automationId} -->`;
}

export function commentContainsWorkspaceAutomationMarker(
  body: string | null | undefined,
  automationId: string,
): boolean {
  if (!body) {
    return false;
  }

  return body.includes(buildWorkspaceAutomationGithubCommentMarker(automationId));
}

export function formatWorkspaceAutomationGithubCommentBody(input: {
  automationId: string;
  message: string;
}): string {
  const marker = buildWorkspaceAutomationGithubCommentMarker(input.automationId);
  const message = input.message.trim();
  const body = `${marker}\n${message}`;
  if (body.length <= GITHUB_ISSUE_COMMENT_MAX_LENGTH) {
    return body;
  }

  const suffix = "\n\n_(Comment truncated.)_";
  const budget = GITHUB_ISSUE_COMMENT_MAX_LENGTH - marker.length - 1 - suffix.length;
  return `${marker}\n${message.slice(0, Math.max(budget, 0)).trimEnd()}${suffix}`;
}

function parseRepositoryFullName(fullName: string): { owner: string; repo: string } | null {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    return null;
  }
  return { owner, repo };
}

function isGithubNullOid(sha: string): boolean {
  return sha.length === 0 || /^0+$/.test(sha);
}

function preferAssociatedPullRequest(
  pullRequests: Array<{ number: number; state: string; updated_at: string }>,
): { number: number; state: string; updated_at: string } | null {
  if (pullRequests.length === 0) {
    return null;
  }

  const ranked = [...pullRequests].toSorted((left, right) => {
    const leftOpen = left.state === "open" ? 0 : 1;
    const rightOpen = right.state === "open" ? 0 : 1;
    if (leftOpen !== rightOpen) {
      return leftOpen - rightOpen;
    }
    return right.updated_at.localeCompare(left.updated_at);
  });

  return ranked[0] ?? null;
}

export async function upsertWorkspaceAutomationPullRequestComment(input: {
  installationId: string;
  repositoryFullName: string;
  automationId: string;
  commitSha: string;
  message: string;
}): Promise<
  Result<
    UpsertWorkspaceAutomationPullRequestCommentSuccess,
    UpsertWorkspaceAutomationPullRequestCommentError
  >
> {
  const commitSha = input.commitSha.trim();
  if (!commitSha || isGithubNullOid(commitSha)) {
    return ok({ status: "skipped", code: "github_commit_not_found" });
  }

  const parsed = parseRepositoryFullName(input.repositoryFullName);
  if (!parsed) {
    return err({
      code: "invalid_repository_full_name",
      message: "GitHub repository full name is invalid.",
    });
  }

  try {
    const octokit = await getInstallationOctokit(input.installationId);
    const associated = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner: parsed.owner,
      repo: parsed.repo,
      commit_sha: commitSha,
    });
    const pullRequest = preferAssociatedPullRequest(associated.data);
    if (!pullRequest) {
      return ok({ status: "skipped", code: "github_pr_not_found" });
    }

    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      owner: parsed.owner,
      repo: parsed.repo,
      issue_number: pullRequest.number,
      per_page: 100,
    });
    const existing = comments.find((comment) =>
      commentContainsWorkspaceAutomationMarker(comment.body, input.automationId),
    );
    const body = formatWorkspaceAutomationGithubCommentBody({
      automationId: input.automationId,
      message: input.message,
    });

    if (existing) {
      const updated = await octokit.rest.issues.updateComment({
        owner: parsed.owner,
        repo: parsed.repo,
        comment_id: existing.id,
        body,
      });
      return ok({
        status: "updated",
        pullRequestNumber: pullRequest.number,
        commentId: updated.data.id,
        url: updated.data.html_url,
      });
    }

    const created = await octokit.rest.issues.createComment({
      owner: parsed.owner,
      repo: parsed.repo,
      issue_number: pullRequest.number,
      body,
    });
    return ok({
      status: "created",
      pullRequestNumber: pullRequest.number,
      commentId: created.data.id,
      url: created.data.html_url,
    });
  } catch (error) {
    return err({
      code: "github_comment_send_failed",
      message: error instanceof Error ? error.message : "GitHub comment failed.",
    });
  }
}
