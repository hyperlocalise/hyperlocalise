/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { getWorkflowMetadata } from "workflow";

import type { ReviewJobEventData } from "@/lib/workflow/types";
import {
  claimReviewJobStep,
  completeReviewJobStep,
  executeClaimedReviewJobStep,
  failReviewJobStep,
} from "./steps/review-job";

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "review job execution failed";
}

export async function reviewJobWorkflow(event: ReviewJobEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const claim = await claimReviewJobStep({
    event,
    runId: workflowRunId,
  });

  if (claim.kind === "skipped") {
    return claim.job;
  }

  try {
    const execution = await executeClaimedReviewJobStep(claim.job);

    if (!execution.ok) {
      return failReviewJobStep({
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        workflowRunId: claim.job.workflowRunId,
        code: execution.code,
        message: execution.message,
      });
    }

    return completeReviewJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      outcome: execution.outcome,
      status: execution.status,
    });
  } catch (error) {
    return failReviewJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "review_execution_failed",
      message: formatExecutionError(error),
    });
  }
}
