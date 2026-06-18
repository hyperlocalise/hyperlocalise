import { stepCountIs, ToolLoopAgent, type ToolLoopAgentSettings } from "ai";
import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";
import type { HyperlocaliseConversationIntent } from "@/lib/agent-runtime/loops/conversation-mode";
import {
  buildSubagentSummaryLines,
  listAvailableSubagentTypes,
  resolvePreferredSubagentOrder,
} from "@/lib/agent-runtime/subagents/registry";
import type { HyperlocaliseSubagentType } from "@/lib/agent-runtime/subagents/definitions";
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

type OrchestratorTools = { task: ReturnType<typeof createTaskTool> };

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
  additionalInstructions?: string;
}) {
  const base = buildOrchestratorBaseInstructions({
    surface: input.surface,
    projectId: input.projectId,
    additionalInstructions: input.additionalInstructions,
  });

  const lines = [base, "", "Available agents:", buildSubagentSummaryLines()];

  if (input.availableSubagents.length === 0) {
    lines.push(
      "",
      "No agents are available for this request. Explain what the user should provide (file attachment or GitHub repo access).",
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

  lines.push(
    "",
    "After each agent returns, synthesize one clear user-facing reply that covers every intent addressed.",
  );

  return lines.join("\n");
}

export function createConversationOrchestratorAgent(
  runtime: HyperlocaliseAgentRuntimeContext,
  onFinish?: ConversationOrchestratorOnFinish,
) {
  const available = listAvailableSubagentTypes(runtime);
  const preferredSubagents = resolvePreferredSubagentOrder(runtime);
  const taskTool = createTaskTool();
  const mustDelegateOnFirstStep = preferredSubagents.length > 0;

  return new ToolLoopAgent<never, { task: typeof taskTool }>({
    model: getHyperlocaliseAgentModel(),
    instructions: buildOrchestratorInstructions({
      surface: runtime.surface,
      projectId: runtime.toolContext.projectId,
      suggestedIntents: runtime.suggestedIntents,
      suggestedMode: runtime.suggestedMode,
      availableSubagents: available,
      preferredSubagents,
      additionalInstructions: runtime.additionalInstructions,
    }),
    tools: {
      task: taskTool,
    },
    activeTools: available.length > 0 ? ["task"] : [],
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
