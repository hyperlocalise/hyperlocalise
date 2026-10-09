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
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
  type UIMessage,
} from "ai";

import type { InboxChatDataTypes } from "@/lib/agent-contracts/inbox-chat-message";
import {
  AUTOMATION_ASSISTANT_TURN_PART,
  AUTOMATION_SETUP_PAGE_EDITS_PART,
  AUTOMATION_SETUP_SNAPSHOT_PART,
  describeAutomationSetupPage,
  listAutomationSetupPageEdits,
  type AutomationSetupPageEdit,
} from "@/lib/agents/workspace-automation-assistant";
import type { WorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import {
  PRODUCT_USAGE_ANALYTICS_EVENTS,
  productUsageSourceForAutomationEditorMode,
} from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import {
  addAutomationAssistantMessage,
  endAutomationAssistantTurn,
  findAutomationAssistantFormAfterLastTurn,
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
import type { ResolvedAgentLanguageModel } from "@/lib/providers/language-model";

import { createAutomationAssistantAgent } from "../agent";
import type { AutomationAssistantToolContext } from "../tools/update_automation_setup";

export const AUTOMATION_ASSISTANT_USAGE_SOURCE = "automation_assistant_turn";

/**
 * What the assistant's stream carries beside the reply: progress, the person's page edits, and
 * the turn's id.
 */
type AutomationAssistantUIMessage = UIMessage<
  never,
  InboxChatDataTypes & {
    "page-edits": { edits: AutomationSetupPageEdit[] };
    turn: { id: string };
  }
>;
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
 * Puts the page as it stands at the start of the person's newest message, so that the request is
 * the last thing the model reads and the page the last thing before it. It is added for this
 * turn only and never saved, so no stale copy of it builds up in the history.
 */
function withPageNow(
  messages: ModelMessage[],
  pageContext: WorkspaceAutomationEditorContext,
): ModelMessage[] {
  const last = messages.at(-1);
  if (last?.role !== "user") {
    return messages;
  }
  const page = { type: "text" as const, text: describeAutomationSetupPage(pageContext) };
  const content =
    typeof last.content === "string"
      ? [page, { type: "text" as const, text: last.content }]
      : [page, ...last.content];
  return [...messages.slice(0, -1), { ...last, content }];
}

/**
 * Runs one turn of the automation assistant and streams it to the page. The person's message is
 * saved first and counted in product analytics, the turn is billed like a dock turn under its own
 * surface, the reply is saved when the stream ends, and the session's turn claim is released
 * whatever happens. The caller claims the turn before calling this.
 */
export function createAutomationAssistantTurnResponse(input: {
  session: AutomationAssistantSession;
  organizationId: string;
  text: string;
  pageContext: WorkspaceAutomationEditorContext;
  languageModel: ResolvedAgentLanguageModel;
}) {
  const { session } = input;
  const usageOperationKey = `automation-assistant-turn:${session.id}:${randomUUID()}`;
  // The session is not a conversation, so the usage record names it here instead of linking to one.
  const usageDimensions = {
    surface: "automation_assistant",
    agent_surface: "automation_assistant",
    mode: input.pageContext.mode,
    automation_assistant_session_id: session.id,
  };
  let shouldTrackUsage = false;
  let agentTokenUsagePromise: Promise<AiTokenUsage | null> | null = null;
  // The tool rewrites this as it works, so after the turn it holds the form the turn left.
  const toolContext: AutomationAssistantToolContext = { automationEditor: input.pageContext };

  const stream = createUIMessageStream<AutomationAssistantUIMessage>({
    execute: async ({ writer }) => {
      // Whatever differs between the form the last turn left and the page this message comes
      // from, the person changed themselves. It is saved with their message, so every later turn
      // knows a change an earlier turn made may no longer be there.
      const formAfterLastTurn = await findAutomationAssistantFormAfterLastTurn(session.id);
      const pageEdits = formAfterLastTurn
        ? listAutomationSetupPageEdits(formAfterLastTurn, input.pageContext.form)
        : [];
      const turnId = await addAutomationAssistantMessage({
        sessionId: session.id,
        senderType: "user",
        text: input.text,
        ...(pageEdits.length > 0
          ? {
              parts: [
                { type: AUTOMATION_SETUP_PAGE_EDITS_PART, data: { edits: pageEdits } },
                { type: "text", text: input.text },
              ],
            }
          : {}),
      });
      // Sent before anything can fail, so the page that ran this turn knows it as the session's
      // latest even when no reply follows.
      writer.write({ type: AUTOMATION_ASSISTANT_TURN_PART, data: { id: turnId } });
      // Counted when the person's message is saved, as a conversation message is, whatever
      // becomes of the reply.
      serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.automationAssistantMessageSent, {
        status: "sent",
        source: productUsageSourceForAutomationEditorMode(input.pageContext.mode),
      });
      await reserveAgentRuntimeUsage({
        organizationId: input.organizationId,
        operationKey: usageOperationKey,
        source: AUTOMATION_ASSISTANT_USAGE_SOURCE,
        dimensions: usageDimensions,
      });
      shouldTrackUsage = true;

      // The panel shows this above the person's message while the reply is still being written.
      if (pageEdits.length > 0) {
        writer.write({ type: AUTOMATION_SETUP_PAGE_EDITS_PART, data: { edits: pageEdits } });
      }
      writer.write({ type: "data-status", id: "prep", data: { message: "Thinking…" } });
      const messages = withPageNow(
        await loadAutomationAssistantModelMessages(session.id),
        input.pageContext,
      );
      const agent = createAutomationAssistantAgent({
        toolContext,
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
            await addAutomationAssistantMessage({
              sessionId: session.id,
              senderType: "agent",
              text: text || "(no response)",
              parts: [
                ...(parts.length > 0 ? parts : [{ type: "text" as const, text: "(no response)" }]),
                // The form as this turn left it, for the next turn to compare the page with.
                {
                  type: AUTOMATION_SETUP_SNAPSHOT_PART,
                  data: { form: toolContext.automationEditor.form },
                },
              ],
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
