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
import { ORCHESTRATOR_STEP_LIMIT } from "@/lib/agent-runtime/subagents/constants";

import type { HyperlocaliseConversationMode } from "./conversation-mode";
import { getHyperlocaliseAgentModel } from "./model";
import {
  buildHyperlocaliseAgentInstructions,
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
  const base = buildHyperlocaliseAgentInstructions({
    surface: input.surface,
    projectId: input.projectId,
    additionalInstructions: input.additionalInstructions,
  });

  const lines = [
    base,
    "",
    "## Orchestration",
    "You coordinate agents via the `task` tool. Do not call translation or repository tools directly.",
    "Your job is to choose the right agent, provide a precise handoff, then synthesize the result for the user.",
    "",
    "Available agents:",
    buildSubagentSummaryLines(),
  ];

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
    lines.push(
      `Delegate to \`${input.preferredSubagents[0]}\` for this turn unless the user clearly needs a different agent.`,
    );
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
    "Repository context handoff:",
    "- Use `repository` only for read-only localization context exploration in the connected GitHub repo.",
    "- Delegate when the user asks where a localized string/message/key appears, what source copy means, or what context a translation should use.",
    "- Include exact source text, keys, file paths, surrounding text, source/target locales, and repository hints when the conversation provides them.",
    "- Require an exact quoted search first, preserving capitalization and punctuation, followed by a case-insensitive search for the same text if the exact search has no matches.",
    "- Require fuzzySearch for short UI labels when exact and case-insensitive searches do not find useful context.",
    "- For short visible UI labels, menu items, sidebar items, or page headings, require searches across component, route, app shell, sidebar, navigation, and config files before accepting no-match results.",
    "- Ask the repository agent to try lowercase route/key variants and nearby navigation labels for single-word or short-title UI copy.",
    "- Tell the repository agent not to return `no match` for a short UI label until it has tried exact, case-insensitive, fuzzySearch, lowercase, route/key, navigation, component, config, and locale/resource searches.",
    "- Ask the repository agent to include a brief search log with patterns and repo areas checked.",
    "- Ask for product surface, user intent, tone/register, placeholder meanings, nearby copy, existing translations, and ambiguities.",
    "- Do not use repository context for broad architecture summaries, PR fixes, code review, checks, or source edits.",
    "",
    "Translation handoff:",
    "- Use `translation` for uploaded-file translation jobs when sourceFileId values and locales are available.",
    "- When both repository and translation intents are active, complete repository context collection before translation jobs.",
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
    stopWhen: stepCountIs(ORCHESTRATOR_STEP_LIMIT),
    onFinish,
  });
}
