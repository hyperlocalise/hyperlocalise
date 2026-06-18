import { stepCountIs, ToolLoopAgent } from "ai";

import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";
import {
  WORKSPACE_ORCHESTRATOR_STEP_LIMIT,
  WORKSPACE_ORCHESTRATOR_TIMEOUT,
} from "@/lib/agent-runtime/subagents/constants";
import { hyperlocaliseAgentMaxOutputTokens } from "@/lib/agent-runtime/loops/hyperlocalise-agent";

import { buildWorkspaceOrchestratorTools } from "./build-workspace-orchestrator-tools";
import type { WorkspaceOrchestratorSession } from "./context";

export function createWorkspaceOrchestratorAgent(session: WorkspaceOrchestratorSession) {
  const tools = buildWorkspaceOrchestratorTools(session);
  const plannedToolCount = session.plan.tools.length;
  const stepLimit = Math.min(WORKSPACE_ORCHESTRATOR_STEP_LIMIT, Math.max(plannedToolCount + 1, 1));

  return new ToolLoopAgent({
    model: getHyperlocaliseAgentModel(),
    instructions: session.composedInstructions,
    tools,
    activeTools: session.plan.tools,
    experimental_context: session,
    maxOutputTokens: hyperlocaliseAgentMaxOutputTokens,
    timeout: WORKSPACE_ORCHESTRATOR_TIMEOUT,
    stopWhen: stepCountIs(stepLimit),
    prepareStep: ({ stepNumber }) => {
      const toolName = session.plan.tools[stepNumber];
      if (toolName) {
        return {
          activeTools: [toolName],
          toolChoice: { type: "tool", toolName },
        };
      }

      return {
        toolChoice: "none",
      };
    },
  });
}
