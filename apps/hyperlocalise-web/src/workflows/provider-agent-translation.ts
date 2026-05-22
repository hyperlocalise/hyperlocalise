import { getWorkflowMetadata } from "workflow";

import type { ProviderAgentTranslationEventData } from "@/lib/workflow/types";

import { executeProviderAgentTranslationStep } from "./steps/provider-agent-translation";

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "provider agent translation failed";
}

export async function providerAgentTranslationWorkflow(event: ProviderAgentTranslationEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  try {
    const result = await executeProviderAgentTranslationStep(event);

    return {
      ...result,
      workflowRunId,
    };
  } catch (error) {
    return {
      ok: false as const,
      agentRunId: event.agentRunId,
      code: "provider_agent_translation_failed",
      message: formatExecutionError(error),
      workflowRunId,
    };
  }
}
