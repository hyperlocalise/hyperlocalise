import type { Thread } from "chat";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { addInteractionMessage } from "@/lib/conversations/interactions";
import {
  getWebConversationRepositorySession,
  setWebConversationRepositorySession,
} from "@/lib/agent-runtime/loops/conversation-repository-session";
import { prepareConversationAgentTurn } from "@/lib/agent-runtime/loops/conversation-turn";

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
}) {
  const repositorySessionState = getWebConversationRepositorySession(input.conversationId);
  const prepared = await prepareConversationAgentTurn({
    surface: "web",
    conversationId: input.conversationId,
    organizationId: input.toolContext.organizationId,
    localUserId: input.toolContext.localUserId,
    membershipRole: input.toolContext.membershipRole,
    projectId: input.toolContext.projectId,
    messageText: input.messageText,
    hasTranslationAttachments: input.hasTranslationAttachments,
    repositorySession: repositorySessionState?.session ?? null,
    repositorySource: "chat_ui",
    db: input.toolContext.db,
  });

  if (prepared.updatedRepositorySession) {
    setWebConversationRepositorySession(input.conversationId, {
      baseVersion: repositorySessionState?.version ?? null,
      session: prepared.updatedRepositorySession,
    });
  }

  if (prepared.clarificationFollowUp) {
    return {
      classification: prepared.classification,
      clarificationFollowUp: prepared.clarificationFollowUp,
      textStream: null,
    };
  }

  const result = await prepared.agent.stream({ messages: prepared.chatMessages });
  return {
    classification: prepared.classification,
    clarificationFollowUp: null,
    textStream: result.textStream,
  };
}

export async function postWebClarificationReply(
  thread: Thread<Record<string, unknown>>,
  conversationId: string,
  text: string,
) {
  await thread.post(text);
  await addInteractionMessage({
    interactionId: conversationId,
    senderType: "agent",
    text,
  });
}
