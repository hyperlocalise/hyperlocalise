import { stepCountIs, ToolLoopAgent, type ToolLoopAgentSettings, type ToolSet } from "ai";
import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";
import type { HyperlocaliseConversationIntent } from "@/lib/agent-runtime/loops/conversation-mode";
import {
  buildSubagentSummaryLines,
  listAvailableSubagentTypes,
  resolvePreferredSubagentOrder,
} from "@/lib/agent-runtime/subagents/registry";
import type { HyperlocaliseSubagentType } from "@/lib/agent-runtime/subagents/definitions";
import { buildOrchestratorDirectTools } from "@/lib/agent-runtime/tools/build-orchestrator-tools";
import {
  orchestratorDirectToolNames,
  shouldUseCrowdinDirectTools,
} from "@/lib/agent-runtime/tools/orchestrator-direct-path";
import { createTaskTool } from "@/lib/agent-runtime/tools/task-tool";
import { buildOrchestratorBaseInstructions } from "@/agents/hyperlocalise/agent/agent";
import {
  ORCHESTRATOR_AGENT_TIMEOUT,
  ORCHESTRATOR_STEP_LIMIT,
} from "@/lib/agent-runtime/subagents/constants";

import type { HyperlocaliseConversationMode } from "./conversation-mode";
import { getHyperlocaliseAgentModel } from "./model";
import {
  hyperlocaliseAgentMaxOutputTokens,
  type HyperlocaliseAgentSurface,
} from "./hyperlocalise-agent";

type OrchestratorTools = ToolSet & { task: ReturnType<typeof createTaskTool> };

export type ConversationOrchestratorOnFinish = ToolLoopAgentSettings<
  never,
  OrchestratorTools
>["onFinish"];

export function buildOrchestratorInstructions(input: {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  suggestedIntents: HyperlocaliseConversationIntent[];
  suggestedMode: HyperlocaliseConversationMode;
  availableSubagents: string[];
  preferredSubagents: HyperlocaliseSubagentType[];
  useCrowdinDirectTools: boolean;
  additionalInstructions?: string;
}) {
  const base = buildOrchestratorBaseInstructions({
    surface: input.surface,
    projectId: input.projectId,
    additionalInstructions: input.additionalInstructions,
    sharedSkills: input.useCrowdinDirectTools ? ["crowdin"] : undefined,
  });

  const lines = [base, "", "Available agents:", buildSubagentSummaryLines()];

  if (input.useCrowdinDirectTools) {
    lines.push(
      "",
      "For this Crowdin/TMS request, use `list_projects`, `update_interaction_project`, and `check_crowdin_progress` directly.",
      "Resolve the project by name with `list_projects` when the conversation is not attached to one yet.",
      "Do not delegate read-only Crowdin progress to the translation agent.",
    );
  } else if (input.availableSubagents.length === 0) {
    lines.push(
      "",
      "No agents are available for this request. Explain what the user should provide (file attachment, GitHub repo access, or a linked Crowdin project).",
    );
  } else {
    lines.push(
      "",
      `Agents available now: ${input.availableSubagents.map((name) => `\`${name}\``).join(", ")}.`,
    );
  }

  lines.push(
    "",
    `Active intents for this message: ${input.suggestedIntents.map((intent) => `\`${intent}\``).join(", ")}.`,
  );

  if (input.useCrowdinDirectTools) {
    return lines.join("\n");
  }

  if (input.preferredSubagents.length === 1) {
    lines.push(`Delegate to \`${input.preferredSubagents[0]}\` for this turn before answering.`);
  } else if (input.preferredSubagents.length > 1) {
    lines.push(
      `Delegate to each required agent in order: ${input.preferredSubagents.map((name) => `\`${name}\``).join(" → ")}.`,
      "Run every agent that matches an active intent before sending the final reply.",
      "Pass repository findings into the translation task when both intents apply.",
    );
  } else if (input.suggestedMode !== "general") {
    lines.push(
      `Conversation mode hint: ${input.suggestedMode}. Pick the matching agent when available.`,
    );
  }

  return lines.join("\n");
}

export function createConversationOrchestratorAgent(
  runtime: HyperlocaliseAgentRuntimeContext,
  onFinish?: ConversationOrchestratorOnFinish,
) {
  const useCrowdinDirectTools = shouldUseCrowdinDirectTools(runtime);
  const available = listAvailableSubagentTypes(runtime);
  const preferredSubagents = useCrowdinDirectTools ? [] : resolvePreferredSubagentOrder(runtime);
  const taskTool = createTaskTool();
  const directTools = useCrowdinDirectTools
    ? buildOrchestratorDirectTools(runtime.toolContext)
    : {};
  const tools: OrchestratorTools = {
    task: taskTool,
    ...directTools,
  };
  const mustDelegateOnFirstStep = preferredSubagents.length > 0;
  const activeTools: string[] = useCrowdinDirectTools
    ? [...orchestratorDirectToolNames]
    : available.length > 0
      ? ["task"]
      : [];

  return new ToolLoopAgent<never, OrchestratorTools>({
    model: getHyperlocaliseAgentModel(),
    instructions: buildOrchestratorInstructions({
      surface: runtime.surface,
      projectId: runtime.toolContext.projectId,
      suggestedIntents: runtime.suggestedIntents,
      suggestedMode: runtime.suggestedMode,
      availableSubagents: available,
      preferredSubagents,
      useCrowdinDirectTools,
      additionalInstructions: runtime.additionalInstructions,
    }),
    tools,
    activeTools,
    experimental_context: runtime,
    maxOutputTokens: hyperlocaliseAgentMaxOutputTokens,
    timeout: ORCHESTRATOR_AGENT_TIMEOUT,
    stopWhen: stepCountIs(ORCHESTRATOR_STEP_LIMIT),
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 0 && mustDelegateOnFirstStep) {
        return {
          activeTools: ["task"],
          toolChoice: { type: "tool", toolName: "task" },
        };
      }

      if (stepNumber === 1 && preferredSubagents.length === 1) {
        return {
          toolChoice: "none",
        };
      }

      return {};
    },
    onFinish,
  });
}
