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
import { getWorkflowMetadata } from "workflow";

import type { GithubPullRequestReviewTask } from "@/lib/workflow/types";

import { runGithubPullRequestReviewJobStep } from "./steps/github-pull-request-review";

export async function githubPullRequestReviewWorkflow(
  task: GithubPullRequestReviewTask,
): Promise<{ ok: boolean; workflowRunId: string; summary: string }> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await runGithubPullRequestReviewJobStep({ task, workflowRunId });
  return {
    ok: result.ok,
    workflowRunId,
    summary: result.summary,
  };
}
