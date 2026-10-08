/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { randomUUID } from "node:crypto";
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";

import type { InboxChatUIMessage } from "@/lib/agent-contracts/inbox-chat-message";
import type { WorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import {
  endAutomationAssistantTurn,
  loadAutomationAssistantModelMessages,
  type AutomationAssistantSession,
} from "@/lib/automation-assistant/sessions";
import {
  addAiTokenUsage,
  extractAiSdkTokenUsage,
  reserveAgentRuntimeUsage,
  trackSucceededAgentRuntimeUsage,
} from "@/lib/billing/agent-runtime-usage";
import type { AiTokenUsage } from "@/lib/billing/usage-control";
import { addInteractionMessage } from "@/lib/conversations/interactions";
import type { ResolvedAgentLanguageModel } from "@/lib/providers/language-model";

import { createAutomationAssistantAgent } from "../agent";

export const AUTOMATION_ASSISTANT_USAGE_SOURCE = "automation_assistant_turn";
const STREAM_ERROR_MESSAGE = "Sorry, something went wrong while the assistant was working.";

function textFromParts(parts: UIMessage["parts"]) {
  return parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

function persistableParts(parts: UIMessage["parts"]): UIMessage["parts"] {
  return parts.filter((part) => !part.type.startsWith("data-"));
}

/**
 * Runs one turn of the automation assistant and streams it to the page. The person's message is
 * saved first, the turn is billed like a dock turn under its own surface, the reply is saved when
 * the stream ends, and the session's turn claim is released whatever happens. The caller claims
 * the turn before calling this.
 */
export function createAutomationAssistantTurnResponse(input: {
  session: AutomationAssistantSession;
  organizationId: string;
  userEmail: string;
  text: string;
  pageContext: WorkspaceAutomationEditorContext;
  languageModel: ResolvedAgentLanguageModel;
}) {
  const { session } = input;
  const usageOperationKey = `automation-assistant-turn:${session.id}:${randomUUID()}`;
  const usageDimensions = {
    surface: "automation_assistant",
    agent_surface: "automation_assistant",
    mode: input.pageContext.mode,
  };
  let shouldTrackUsage = false;
  let agentTokenUsagePromise: Promise<AiTokenUsage | null> | null = null;

  const stream = createUIMessageStream<InboxChatUIMessage>({
    execute: async ({ writer }) => {
      await addInteractionMessage({
        interactionId: session.id,
        senderType: "user",
        senderEmail: input.userEmail,
        text: input.text,
      });
      await reserveAgentRuntimeUsage({
        organizationId: input.organizationId,
        operationKey: usageOperationKey,
        source: AUTOMATION_ASSISTANT_USAGE_SOURCE,
        interactionId: session.id,
        dimensions: usageDimensions,
      });
      shouldTrackUsage = true;

      writer.write({ type: "data-status", id: "prep", data: { message: "Thinking…" } });
      const messages = await loadAutomationAssistantModelMessages(session.id);
      const agent = createAutomationAssistantAgent({
        context: input.pageContext,
        model: input.languageModel.model,
      });
      const result = await agent.stream({ messages });
      agentTokenUsagePromise = Promise.resolve(result.usage).then(extractAiSdkTokenUsage);
      writer.merge(result.toUIMessageStream({ sendReasoning: true, sendStart: true }));
    },
    onEnd: async ({ responseMessage, isAborted }) => {
      try {
        if (!isAborted) {
          const parts = persistableParts(responseMessage.parts);
          const text = textFromParts(parts).trim();
          if (text || parts.length > 0) {
            await addInteractionMessage({
              interactionId: session.id,
              senderType: "agent",
              text: text || "(no response)",
              parts: parts.length > 0 ? parts : [{ type: "text", text: text || "(no response)" }],
            });
          }
        }
        if (shouldTrackUsage && !isAborted) {
          const tokenUsage = addAiTokenUsage(
            null,
            agentTokenUsagePromise ? await agentTokenUsagePromise.catch(() => null) : null,
          );
          await trackSucceededAgentRuntimeUsage({
            organizationId: input.organizationId,
            operationKey: usageOperationKey,
            dimensions: usageDimensions,
            tokenUsage,
            aiCreditModelId: tokenUsage ? input.languageModel.modelId : undefined,
            aiCreditCredentialSource: tokenUsage
              ? input.languageModel.source === "gateway"
                ? "gateway"
                : "byok"
              : undefined,
            interactionId: session.id,
          });
        }
      } catch (error) {
        console.error("[automation-assistant] Failed to finish the turn", {
          sessionId: session.id,
          err: error instanceof Error ? error.message : "unknown",
        });
      } finally {
        await endAutomationAssistantTurn(session.id);
      }
    },
    onError: () => STREAM_ERROR_MESSAGE,
  });

  return createUIMessageStreamResponse({ stream });
}
