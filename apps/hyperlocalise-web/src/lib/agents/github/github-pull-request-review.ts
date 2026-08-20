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
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";
import type { GithubPullRequestReviewQueue } from "@/lib/workflow/types";
import { createGithubPullRequestReviewQueue } from "@/workflows/adapters";

import {
  GITHUB_AUTO_REVIEW_COMMENT_AUTOMATION_ID,
  getGithubAutoReviewSettings,
  isGithubAutoReviewEnabledForRepository,
} from "./github-auto-review-settings";
import {
  buildGitHubPullRequestReviewRequestInput,
  claimGitHubAgentRequest,
  markGitHubAgentRequestEnqueued,
  releaseGitHubAgentRequestClaim,
} from "./request-idempotency";
import { upsertWorkspaceAutomationPullRequestComment } from "./upsert-workspace-automation-pull-request-comment";

const logger = createLogger("github-pull-request-review");

export const GITHUB_PULL_REQUEST_REVIEW_QUEUED_MESSAGE =
  "Reviewing this pull request for localisation issues. I will update this comment when the review finishes.";

export type EnqueueGithubPullRequestReviewInput = {
  organizationId: string;
  githubInstallationId: string;
  githubInstallationRepositoryId?: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  headSha: string;
  baseSha: string | null;
  trigger: "auto_review" | "mention";
  commentId?: number | null;
  queue?: GithubPullRequestReviewQueue;
};

export type EnqueueGithubPullRequestReviewResult =
  | { outcome: "enqueued"; requestId: string; workflowRunIds: string[] }
  | { outcome: "already_queued"; requestId: string }
  | { outcome: "skipped"; reason: "auto_review_not_enabled" };

export async function enqueueGithubPullRequestReview(
  input: EnqueueGithubPullRequestReviewInput,
): Promise<EnqueueGithubPullRequestReviewResult> {
  if (input.trigger === "auto_review") {
    if (!input.githubInstallationRepositoryId) {
      return { outcome: "skipped", reason: "auto_review_not_enabled" };
    }
    const enabled = await isGithubAutoReviewEnabledForRepository({
      organizationId: input.organizationId,
      githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    });
    if (!enabled) {
      return { outcome: "skipped", reason: "auto_review_not_enabled" };
    }
  }

  const settings = await getGithubAutoReviewSettings(input.organizationId);
  const claim = await claimGitHubAgentRequest(
    buildGitHubPullRequestReviewRequestInput({
      requestKind: input.trigger === "mention" ? "review" : "auto_review",
      installationId: input.githubInstallationId,
      repositoryFullName: input.repositoryFullName,
      pullRequestNumber: input.pullRequestNumber,
      commentId: input.trigger === "mention" ? (input.commentId ?? null) : null,
      headSha: input.headSha,
    }),
  );

  if (claim.alreadyQueued) {
    return { outcome: "already_queued", requestId: claim.requestId };
  }

  const queue = input.queue ?? createGithubPullRequestReviewQueue();
  try {
    const commentResult = await upsertWorkspaceAutomationPullRequestComment({
      installationId: input.githubInstallationId,
      repositoryFullName: input.repositoryFullName,
      automationId: GITHUB_AUTO_REVIEW_COMMENT_AUTOMATION_ID,
      commitSha: input.headSha,
      pullRequestNumber: input.pullRequestNumber,
      message: GITHUB_PULL_REQUEST_REVIEW_QUEUED_MESSAGE,
    });
    if (isErr(commentResult)) {
      logger.warn(
        { code: commentResult.error.code, pullRequestNumber: input.pullRequestNumber },
        "failed to post github auto-review queued comment",
      );
    }

    const result = await queue.enqueue({
      organizationId: input.organizationId,
      githubInstallationId: input.githubInstallationId,
      repositoryFullName: input.repositoryFullName,
      pullRequestNumber: input.pullRequestNumber,
      headSha: input.headSha,
      baseSha: input.baseSha,
      additionalPrompt: settings.additionalPrompt,
      trigger: input.trigger,
    });
    await markGitHubAgentRequestEnqueued({
      requestId: claim.requestId,
      workflowRunIds: result.ids,
    });
    return {
      outcome: "enqueued",
      requestId: claim.requestId,
      workflowRunIds: result.ids,
    };
  } catch (error) {
    await releaseGitHubAgentRequestClaim(claim.requestId);
    throw error;
  }
}
