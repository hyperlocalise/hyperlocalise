import { getWorkflowMetadata } from "workflow";

import type { ProviderAgentCommentEventData } from "@/lib/workflow/types";

import {
  executeProviderAgentCommentStep,
  failProviderAgentCommentStep,
} from "./steps/provider-agent-comment";

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "provider agent comment failed";
}

export async function providerAgentCommentWorkflow(event: ProviderAgentCommentEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  try {
    const result = await executeProviderAgentCommentStep(event);

    return {
      ...result,
      workflowRunId,
    };
  } catch (error) {
    const failure = await failProviderAgentCommentStep({
      agentRunId: event.agentRunId,
      organizationId: event.organizationId,
      code: "provider_agent_comment_failed",
      message: formatExecutionError(error),
    });

    return {
      ...failure,
      workflowRunId,
    };
  }
}
