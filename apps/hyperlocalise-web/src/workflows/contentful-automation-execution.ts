import { getWorkflowMetadata } from "workflow";

import { isErr } from "@/lib/primitives/result/results";
import type { ContentfulAutomationExecutionEventData } from "@/lib/workflow/types";

import { executeContentfulAutomationStep } from "./steps/contentful-automation-execution";

export async function contentfulAutomationExecutionWorkflow(
  event: ContentfulAutomationExecutionEventData,
) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await executeContentfulAutomationStep(event);

  if (isErr(result)) {
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
