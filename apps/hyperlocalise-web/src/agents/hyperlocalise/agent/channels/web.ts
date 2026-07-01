import type { Thread } from "chat";

import {
  buildTranslationAttachmentRequiredMessage,
  classifyConversation,
  createConversationToolLoopAgent,
  getRecentUserConversationText,
  loadInteractionModelMessages,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import { resolveOrganizationHasTmsIntegration } from "@/lib/agent-runtime/skills/conversation-tms-integration";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { addInteractionMessage } from "@/lib/conversations/interactions";

export async function postStreamingAgentReply(
  thread: Thread<Record<string, unknown>>,
  stream: AsyncIterable<string>,
) {
  let text = "";

  async function* captureTextStream() {
    for await (const chunk of stream) {
      text += chunk;
      yield chunk;
    }
  }

  await thread.post(captureTextStream());

  return text;
}

export async function runWebChatAgentTurn(input: {
  conversationId: string;
  messageText: string;
  toolContext: ToolContext;
  hasTranslationAttachments: boolean;
  hasStoredRepositoryContext?: boolean;
}) {
  const chatMessages = await loadInteractionModelMessages(input.conversationId);
  const conversationText = getRecentUserConversationText(chatMessages, input.messageText);
  const classification = await classifyConversation({
    currentMessage: input.messageText,
    conversationText,
    hasFileAttachments: input.hasTranslationAttachments,
    hasStoredRepositoryContext: input.hasStoredRepositoryContext ?? false,
    surface: "web",
  });

  const hasTmsIntegration = await resolveOrganizationHasTmsIntegration(
    input.toolContext.organizationId,
  );

  const agent = createConversationToolLoopAgent({
    surface: "web",
    toolContext: input.toolContext,
    hasFileAttachments: input.hasTranslationAttachments,
    hasTmsIntegration,
  });

  const result = await agent.stream({ messages: chatMessages });
  return {
    classification,
    textStream: result.textStream,
  };
}

export async function postWebAttachmentRequiredReply(
  thread: Thread<Record<string, unknown>>,
  conversationId: string,
) {
  const text = buildTranslationAttachmentRequiredMessage("web");
  await thread.post(text);
  await addInteractionMessage({
    interactionId: conversationId,
    senderType: "agent",
    text,
  });
}
