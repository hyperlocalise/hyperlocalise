import { getWorkflowMetadata } from "workflow";

import type { ContentfulAutomationExecutionEventData } from "@/lib/workflow/types";

import { executeContentfulAutomationStep } from "./steps/contentful-automation-execution";

export async function contentfulAutomationExecutionWorkflow(
  event: ContentfulAutomationExecutionEventData,
) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await executeContentfulAutomationStep(event);

  if (!result.ok) {
    return {
      workflowRunId,
      ok: false as const,
      runId: result.error.runId,
      message: result.error.message,
    };
  }

  return {
    workflowRunId,
    ok: true as const,
    runId: result.value.runId,
  };
}
