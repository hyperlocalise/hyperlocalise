import { getWorkflowMetadata } from "workflow";

import type { ContentfulAutomationExecutionEventData } from "@/lib/workflow/types";

import { executeContentfulAutomationStep } from "./steps/contentful-automation-execution";

export async function contentfulAutomationExecutionWorkflow(
  event: ContentfulAutomationExecutionEventData,
) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await executeContentfulAutomationStep(event);

  return {
    ...result,
    workflowRunId,
  };
}
