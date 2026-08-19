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

const logger = createLogger("github-pull-request-webhook");

const DISPATCH_ACTIONS = new Set(["opened", "reopened", "synchronize", "ready_for_review"]);

export type GitHubPullRequestWebhookPayload = {
  action?: string;
  pull_request?: {
    number?: number;
    html_url?: string;
    draft?: boolean;
    merged?: boolean;
    base?: { ref?: string; sha?: string };
    head?: { ref?: string; sha?: string };
  };
};

export type HandleGithubPullRequestWebhookInput = {
  deliveryId: string;
  organizationId: string;
  githubInstallationRepositoryId: string;
  githubRepositoryId: string;
  payload: GitHubPullRequestWebhookPayload;
};

export type HandleGithubPullRequestWebhookResult = {
  ignored: boolean;
};

function readBranchName(value: string | undefined): string | null {
  const branch = value?.trim() ?? "";
  return branch.length > 0 ? branch : null;
}

export function shouldDispatchGithubPullRequestAction(
  action: string | undefined,
  pullRequest: GitHubPullRequestWebhookPayload["pull_request"],
): boolean {
  if (!action || !DISPATCH_ACTIONS.has(action)) {
    return false;
  }

  if (pullRequest?.merged) {
    return false;
  }

  if (pullRequest?.draft && action !== "ready_for_review") {
    return false;
  }

  return true;
}

export async function handleGithubPullRequestWebhook(
  input: HandleGithubPullRequestWebhookInput,
): Promise<HandleGithubPullRequestWebhookResult> {
  const pullRequest = input.payload.pull_request;
  if (!shouldDispatchGithubPullRequestAction(input.payload.action, pullRequest)) {
    logger.info(
      {
        deliveryId: input.deliveryId,
        repositoryId: input.githubRepositoryId,
        action: input.payload.action,
      },
      "ignoring pull request event",
    );
    return { ignored: true };
  }

  const pullRequestNumber = pullRequest?.number;
  const baseBranch = readBranchName(pullRequest?.base?.ref);
  const headBranch = readBranchName(pullRequest?.head?.ref);
  const commitAfter = pullRequest?.head?.sha?.trim() ?? "";
  if (!pullRequestNumber || !baseBranch || !headBranch || !commitAfter) {
    logger.info(
      {
        deliveryId: input.deliveryId,
        repositoryId: input.githubRepositoryId,
      },
      "ignoring pull request event without review context",
    );
    return { ignored: true };
  }

  try {
    const { dispatchWorkspaceAutomationsForGithubPullRequest } =
      await import("../workspace-automation-dispatcher");
    await dispatchWorkspaceAutomationsForGithubPullRequest({
      deliveryId: input.deliveryId,
      organizationId: input.organizationId,
      githubInstallationRepositoryId: input.githubInstallationRepositoryId,
      action: input.payload.action ?? "opened",
      pullRequestNumber,
      pullRequestUrl: pullRequest?.html_url,
      baseBranch,
      headBranch,
      commitBefore: pullRequest?.base?.sha?.trim() ?? "",
      commitAfter,
    });
  } catch (error) {
    logger.error(
      {
        deliveryId: input.deliveryId,
        repositoryId: input.githubRepositoryId,
        error: error instanceof Error ? error.message : String(error),
      },
      "workspace automations github pull request dispatch failed",
    );
  }

  return { ignored: false };
}
