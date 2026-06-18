import { eq } from "drizzle-orm";
import {
  stepCountIs,
  ToolLoopAgent,
  type LanguageModel,
  type ModelMessage,
  type ToolLoopAgentSettings,
  type ToolSet,
} from "ai";

import { db, schema } from "@/lib/database";
import type { HyperlocaliseAgentRuntimeContext } from "@/lib/agent-runtime/context";
import { getHyperlocaliseAgentModel } from "./model";

export { getHyperlocaliseAgentModel, hyperlocaliseAgentModelId } from "./model";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

import type { HyperlocaliseConversationIntent } from "./conversation-mode";
import { getPrimarySuggestedMode, normalizeConversationIntents } from "./conversation-classifier";
import {
  createConversationOrchestratorAgent,
  type ConversationOrchestratorOnFinish,
} from "./orchestrator";
import { DEFAULT_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import {
  buildHyperlocaliseBaseInstructions,
  type HyperlocaliseAgentSurface,
} from "@/agents/hyperlocalise/agent/agent";
export type { HyperlocaliseAgentSurface };

export type { HyperlocaliseConversationMode } from "./conversation-mode";
export { buildConversationModeInstructions } from "./conversation-mode";
export {
  classifyConversation,
  createConversationClassifier,
  getPrimarySuggestedMode,
  getRecentUserConversationText,
  normalizeConversationIntents,
  shouldAttemptRepositoryContextResolution,
  shouldRequireRepositoryContextClarification,
  type ConversationClassification,
} from "./conversation-classifier";
export type { HyperlocaliseConversationIntent } from "./conversation-mode";

export const hyperlocaliseAgentStepLimit = 10;
export const hyperlocaliseAgentMaxOutputTokens = 4_000;

type InteractionHistoryRow = {
  senderType: "user" | "agent";
  text: string;
};

type CreateHyperlocaliseAgentInput<TOOLS extends ToolSet> = {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  tools: TOOLS;
  model?: LanguageModel;
  additionalInstructions?: string;
  activeTools?: ToolLoopAgentSettings<never, TOOLS>["activeTools"];
  prepareStep?: ToolLoopAgentSettings<never, TOOLS>["prepareStep"];
  toolChoice?: ToolLoopAgentSettings<never, TOOLS>["toolChoice"];
  onFinish?: ToolLoopAgentSettings<never, TOOLS>["onFinish"];
};

type CreateConversationAgentInput = {
  surface: HyperlocaliseAgentSurface;
  toolContext: ToolContext;
  suggestedIntents: HyperlocaliseConversationIntent[];
  additionalInstructions?: string;
  onFinish?: ConversationOrchestratorOnFinish;
};

export function buildTranslationAttachmentRequiredMessage(surface: HyperlocaliseAgentSurface) {
  const lines = [
    "I can translate supported localization files or search your connected GitHub repository for localized copy.",
    "Attach a file with a target language to create a translation job, or ask me to find text in a repo enabled under Agent → GitHub.",
  ];

  if (surface === "slack") {
    lines.push("Supported file types include JSON, CSV, XLIFF, and other localization formats.");
  }

  return lines.join(" ");
}

export function buildHyperlocaliseAgentInstructions(input: {
  surface: HyperlocaliseAgentSurface;
  projectId: string | null;
  additionalInstructions?: string;
}) {
  return buildHyperlocaliseBaseInstructions(input);
}

export function toModelMessages(rows: InteractionHistoryRow[]): ModelMessage[] {
  return rows.map((row) => ({
    role: row.senderType === "user" ? "user" : "assistant",
    content: row.text,
  }));
}

export function replaceLastUserMessage(messages: ModelMessage[], text: string): ModelMessage[] {
  const nextMessages = [...messages];
  const lastUserIndex = nextMessages.findLastIndex((message) => message.role === "user");

  if (lastUserIndex >= 0) {
    nextMessages[lastUserIndex] = { role: "user", content: text };
    return nextMessages;
  }

  nextMessages.push({ role: "user", content: text });
  return nextMessages;
}

export async function loadInteractionModelMessages(interactionId: string): Promise<ModelMessage[]> {
  const messages = await db
    .select({
      senderType: schema.interactionMessages.senderType,
      text: schema.interactionMessages.text,
    })
    .from(schema.interactionMessages)
    .where(eq(schema.interactionMessages.interactionId, interactionId))
    .orderBy(schema.interactionMessages.createdAt)
    .limit(50);

  return toModelMessages(messages);
}

export function createHyperlocaliseAgent<TOOLS extends ToolSet>({
  surface,
  projectId,
  tools,
  model,
  additionalInstructions,
  activeTools,
  prepareStep,
  toolChoice,
  onFinish,
}: CreateHyperlocaliseAgentInput<TOOLS>) {
  return new ToolLoopAgent({
    model: model ?? getHyperlocaliseAgentModel(),
    instructions: buildHyperlocaliseAgentInstructions({
      surface,
      projectId,
      additionalInstructions,
    }),
    tools,
    activeTools,
    prepareStep,
    toolChoice,
    onFinish,
    maxOutputTokens: hyperlocaliseAgentMaxOutputTokens,
    timeout: DEFAULT_AGENT_TIMEOUT,
    stopWhen: stepCountIs(hyperlocaliseAgentStepLimit),
  });
}

export function createConversationToolLoopAgent({
  surface,
  toolContext,
  suggestedIntents,
  additionalInstructions,
  onFinish,
  hasFileAttachments = false,
}: CreateConversationAgentInput & {
  hasFileAttachments?: boolean;
}) {
  const normalizedIntents = normalizeConversationIntents(suggestedIntents);
  const runtime: HyperlocaliseAgentRuntimeContext = {
    surface,
    toolContext,
    suggestedIntents: normalizedIntents,
    suggestedMode: getPrimarySuggestedMode(normalizedIntents),
    hasFileAttachments,
    additionalInstructions: additionalInstructions?.trim() || undefined,
  };

  return createConversationOrchestratorAgent(runtime, onFinish);
}
