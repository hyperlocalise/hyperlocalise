import { getWorkflowMetadata } from "workflow";

import type { ProviderAgentQaEventData } from "@/lib/workflow/types";

import { executeProviderAgentQaStep, failProviderAgentQaStep } from "./steps/provider-agent-qa";

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "provider agent QA failed";
}

export async function providerAgentQaWorkflow(event: ProviderAgentQaEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  try {
    const result = await executeProviderAgentQaStep(event);

    return {
      ...result,
      workflowRunId,
    };
  } catch (error) {
    const failure = await failProviderAgentQaStep({
      agentRunId: event.agentRunId,
      organizationId: event.organizationId,
      code: "provider_agent_qa_failed",
      message: formatExecutionError(error),
    });

    return {
      ...failure,
      workflowRunId,
    };
  }
}
