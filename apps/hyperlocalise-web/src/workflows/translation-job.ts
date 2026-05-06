import { getWorkflowMetadata } from "workflow";
import type { TranslationJobEventData } from "@/lib/workflow/types";
import {
  claimTranslationJobStep,
  completeTranslationJobStep,
  executeClaimedTranslationJobStep,
  failTranslationJobStep,
} from "./steps/translation-job";

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "translation job execution failed";
}

export async function translationJobWorkflow(event: TranslationJobEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const claim = await claimTranslationJobStep({
    event,
    runId: workflowRunId,
  });

  if (claim.kind === "skipped") {
    return claim.job;
  }

  try {
    const execution = await executeClaimedTranslationJobStep(claim.job);

    if (!execution.ok) {
      return failTranslationJobStep({
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        workflowRunId: claim.job.workflowRunId,
        code: execution.code,
        message: execution.message,
      });
    }

    return completeTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      result: execution.result,
    });
  } catch (error) {
    return failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "translation_execution_failed",
      message: formatExecutionError(error),
    });
  }
}
