import { getWorkflowMetadata } from "workflow";

import type { ProviderAgentWritebackEventData } from "@/lib/workflow/types";

import {
  executeProviderAgentWritebackStep,
  failProviderAgentWritebackStep,
} from "./steps/provider-agent-writeback";

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "provider agent write-back failed";
}

export async function providerAgentWritebackWorkflow(event: ProviderAgentWritebackEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  try {
    const result = await executeProviderAgentWritebackStep(event);

    return {
      ...result,
      workflowRunId,
    };
  } catch (error) {
    const failure = await failProviderAgentWritebackStep({
      agentRunId: event.agentRunId,
      organizationId: event.organizationId,
      code: "provider_agent_writeback_failed",
      message: formatExecutionError(error),
    });

    return {
      ...failure,
      workflowRunId,
    };
  }
}
