import { getWorkflowMetadata } from "workflow";

import type { ProviderAgentQaEventData } from "@/lib/workflow/types";

import {
  completeProviderAgentQaStep,
  failProviderAgentQaStep,
  prepareProviderAgentQaStep,
} from "./steps/provider-agent-qa";
import { runProviderHlCheckSandboxStep } from "./steps/provider-job-hl-check";

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "provider agent QA failed";
}

export async function providerAgentQaWorkflow(event: ProviderAgentQaEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  try {
    const prepared = await prepareProviderAgentQaStep(event);
    if (!prepared.ok) {
      return {
        ...prepared,
        workflowRunId,
      };
    }
    if ("alreadyCompleted" in prepared) {
      return {
        ok: true,
        agentRunId: prepared.agentRunId,
        pullRunId: prepared.pullRunId,
        report: prepared.report,
        alreadyCompleted: true,
        workflowRunId,
      };
    }

    const hlResult = await runProviderHlCheckSandboxStep({
      content: prepared.content,
      targetLocales: prepared.content.targetLocales,
    });

    const result = await completeProviderAgentQaStep({
      agentRunId: event.agentRunId,
      organizationId: event.organizationId,
      projectId: prepared.projectId,
      providerKind: prepared.providerKind,
      pullRunId: prepared.pullRunId,
      content: prepared.content,
      pullFailures: prepared.pullFailures,
      unitsDiscovered: prepared.unitsDiscovered,
      hlResult,
    });

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
