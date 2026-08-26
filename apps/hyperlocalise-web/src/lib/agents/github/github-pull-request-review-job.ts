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
import { GITHUB_AUTO_REVIEW_COMMENT_AUTOMATION_ID } from "@/lib/agents/github/github-auto-review-settings";
import { resolveGithubPullRequestReviewBaseSha } from "@/lib/agents/github/github-pull-request-merge-base";
import { runGithubPullRequestReviewAgent } from "@/lib/agents/github/github-repository-automation-agent";
import {
  buildCommitScopedDiffArgs,
  buildCommitScopedPatchArgs,
  parseNameOnlyDiffPaths,
} from "@/lib/agents/github/github-repository-automation-commits";
import {
  createGithubRepositoryAutomationSandbox,
  runGitDiffInSandbox,
  stopGithubRepositoryAutomationSandbox,
} from "@/lib/agents/github/github-repository-automation-sandbox";
import { upsertWorkspaceAutomationPullRequestComment } from "@/lib/agents/github/upsert-workspace-automation-pull-request-comment";
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";
import type { GithubPullRequestReviewTask } from "@/lib/workflow/types";

const logger = createLogger("github-pull-request-review-job");
const MAX_DIFF_EXCERPT_CHARS = 12_000;

function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_EXCERPT_CHARS) {
    return diff;
  }
  return `${diff.slice(0, MAX_DIFF_EXCERPT_CHARS)}\n\n[diff truncated]`;
}

export async function runGithubPullRequestReviewJob(
  task: GithubPullRequestReviewTask,
  workflowRunId?: string | null,
): Promise<{ ok: boolean; summary: string }> {
  const sandboxId = await createGithubRepositoryAutomationSandbox({
    installationId: task.githubInstallationId,
    repositoryFullName: task.repositoryFullName,
    revision: task.headSha,
    cloneDepth: 50,
  });

  try {
    const parentSha =
      task.baseSha ??
      (await resolveGithubPullRequestReviewBaseSha({
        githubInstallationId: task.githubInstallationId,
        repositoryFullName: task.repositoryFullName,
        pullRequestNumber: task.pullRequestNumber,
        headSha: task.headSha,
      }));
    const nameOnly = await runGitDiffInSandbox(
      sandboxId,
      buildCommitScopedDiffArgs({
        parentSha,
        commitSha: task.headSha,
        paths: [],
      }),
    );
    const changedPaths = parseNameOnlyDiffPaths(nameOnly.output);
    const patch = await runGitDiffInSandbox(
      sandboxId,
      buildCommitScopedPatchArgs({
        parentSha,
        commitSha: task.headSha,
        paths: [],
      }),
    );

    const summary = await runGithubPullRequestReviewAgent({
      organizationId: task.organizationId,
      sandboxId,
      workflowRunId,
      pullRequestNumber: task.pullRequestNumber,
      headSha: task.headSha,
      baseSha: parentSha,
      changedPaths,
      diffExcerpt: truncateDiff(patch.output),
      additionalPrompt: task.additionalPrompt,
    });

    const commentResult = await upsertWorkspaceAutomationPullRequestComment({
      installationId: task.githubInstallationId,
      repositoryFullName: task.repositoryFullName,
      automationId: GITHUB_AUTO_REVIEW_COMMENT_AUTOMATION_ID,
      commitSha: task.headSha,
      pullRequestNumber: task.pullRequestNumber,
      message: summary,
    });
    if (isErr(commentResult)) {
      logger.warn(
        { code: commentResult.error.code, pullRequestNumber: task.pullRequestNumber },
        "failed to post github pull request review comment",
      );
      return { ok: false, summary };
    }

    return { ok: true, summary };
  } finally {
    try {
      await stopGithubRepositoryAutomationSandbox(sandboxId);
    } catch {
      // Best-effort cleanup.
    }
  }
}
