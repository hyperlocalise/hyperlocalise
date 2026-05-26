import { stepCountIs, ToolLoopAgent, type ToolLoopAgentSettings } from "ai";
import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";
import {
  buildSubagentSummaryLines,
  listAvailableSubagentTypes,
  resolveSubagentTypeForMode,
} from "@/lib/agent-runtime/subagents/registry";
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
  suggestedMode: HyperlocaliseConversationMode;
  availableSubagents: string[];
  preferredSubagent: string | null;
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
    "You coordinate specialists via the `task` tool. Do not call translation or repository tools directly.",
    "Your job is to choose the right specialist, provide a precise handoff, then synthesize the result for the user.",
    "",
    "Available specialists:",
    buildSubagentSummaryLines(),
  ];

  if (input.availableSubagents.length === 0) {
    lines.push(
      "",
      "No specialists are available for this request. Explain what the user should provide (file attachment or GitHub repo access).",
    );
  } else {
    lines.push(
      "",
      `Specialists available now: ${input.availableSubagents.map((name) => `\`${name}\``).join(", ")}.`,
    );
  }

  if (input.preferredSubagent) {
    lines.push(
      `Suggested specialist for this message: \`${input.preferredSubagent}\` (mode: ${input.suggestedMode}).`,
      "Delegate to that specialist unless the user clearly needs a different one.",
    );
  } else if (input.suggestedMode !== "general") {
    lines.push(
      `Conversation mode hint: ${input.suggestedMode}. Pick the matching specialist when available.`,
    );
  }

  lines.push(
    "",
    "Repository context handoff:",
    "- Use `repository` only for read-only localization context exploration in the connected GitHub repo.",
    "- Delegate when the user asks where a localized string/message/key appears, what source copy means, or what context a translation should use.",
    "- Include exact source text, keys, file paths, surrounding text, source/target locales, and repository hints when the conversation provides them.",
    "- Ask for product surface, user intent, tone/register, placeholder meanings, nearby copy, existing translations, and ambiguities.",
    "- Do not use repository context for broad architecture summaries, PR fixes, code review, checks, or source edits.",
    "",
    "Translation handoff:",
    "- Use `translation` for uploaded-file translation jobs when sourceFileId values and locales are available.",
    "- If repository context is needed for a translation and the repository specialist is available, collect that context first, then pass the relevant summary into the translation task.",
    "",
    "After a specialist returns, synthesize a clear user-facing reply from their summary.",
  );

  return lines.join("\n");
}

export function createConversationOrchestratorAgent(
  runtime: HyperlocaliseAgentRuntimeContext,
  onFinish?: ConversationOrchestratorOnFinish,
) {
  const available = listAvailableSubagentTypes(runtime);
  const preferredSubagent = resolveSubagentTypeForMode(runtime);
  const taskTool = createTaskTool();

  return new ToolLoopAgent<never, { task: typeof taskTool }>({
    model: getHyperlocaliseAgentModel(),
    instructions: buildOrchestratorInstructions({
      surface: runtime.surface,
      projectId: runtime.toolContext.projectId,
      suggestedMode: runtime.suggestedMode,
      availableSubagents: available,
      preferredSubagent,
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
