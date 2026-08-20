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
import type { GithubPullRequestReviewTask } from "@/lib/workflow/types";

export async function runGithubPullRequestReviewJobStep(input: {
  task: GithubPullRequestReviewTask;
  workflowRunId: string;
}): Promise<{ ok: boolean; summary: string }> {
  "use step";
  const { runGithubPullRequestReviewJob } =
    await import("@/lib/agents/github/github-pull-request-review-job");
  return runGithubPullRequestReviewJob(input.task, input.workflowRunId);
}
