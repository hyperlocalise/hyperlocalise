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
