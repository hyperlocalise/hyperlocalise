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
