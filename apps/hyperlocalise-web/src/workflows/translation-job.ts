import { getWorkflowMetadata } from "workflow";

import type { TranslationJobQueuedEventData } from "@/lib/workflow/types";
import {
  claimTranslationJob,
  completeTranslationJob,
  executeClaimedTranslationJob,
  failTranslationJob,
} from "@/lib/translation/translation-job-queued-function";

type ClaimTranslationJobInput = {
  event: TranslationJobQueuedEventData;
  runId: string;
};

type ClaimedTranslationJob = Extract<
  Awaited<ReturnType<typeof claimTranslationJob>>,
  { kind: "claimed" }
>["job"];

async function claimTranslationJobStep(input: ClaimTranslationJobInput) {
  "use step";

  return claimTranslationJob(input);
}

async function executeClaimedTranslationJobStep(job: ClaimedTranslationJob) {
  "use step";

  return executeClaimedTranslationJob(job);
}

async function completeTranslationJobStep(input: Parameters<typeof completeTranslationJob>[0]) {
  "use step";

  return completeTranslationJob(input);
}

async function failTranslationJobStep(input: Parameters<typeof failTranslationJob>[0]) {
  "use step";

  return failTranslationJob(input);
}

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "translation job execution failed";
}

export async function translationJobWorkflow(event: TranslationJobQueuedEventData) {
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
