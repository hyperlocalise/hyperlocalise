import type { Thread } from "chat";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { addInteractionMessage } from "@/lib/conversations/interactions";
import {
  getWebConversationRepositorySession,
  setWebConversationRepositorySession,
} from "@/lib/agent-runtime/loops/conversation-repository-session";
import {
  prepareConversationAgentTurn,
  type PrepareConversationAgentTurnInput,
  type PrepareConversationAgentTurnResult,
} from "@/lib/agent-runtime/loops/conversation-turn";

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

async function prepareAndCommitWebConversationTurn(
  conversationId: string,
  prepareInput: Omit<PrepareConversationAgentTurnInput, "repositorySession">,
): Promise<PrepareConversationAgentTurnResult> {
  let repositorySessionState = getWebConversationRepositorySession(conversationId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const prepared = await prepareConversationAgentTurn({
      ...prepareInput,
      repositorySession: repositorySessionState?.session ?? null,
    });

    if (!prepared.updatedRepositorySession) {
      return prepared;
    }

    const committed = setWebConversationRepositorySession(conversationId, {
      baseVersion: repositorySessionState?.version ?? null,
      session: prepared.updatedRepositorySession,
    });

    if (committed) {
      return prepared;
    }

    repositorySessionState = getWebConversationRepositorySession(conversationId);
  }

  return prepareConversationAgentTurn({
    ...prepareInput,
    repositorySession: getWebConversationRepositorySession(conversationId)?.session ?? null,
    reuseCommittedRepositorySandboxOnly: true,
  });
}

export async function runWebChatAgentTurn(input: {
  conversationId: string;
  messageText: string;
  toolContext: ToolContext;
  hasTranslationAttachments: boolean;
}) {
  const prepared = await prepareAndCommitWebConversationTurn(input.conversationId, {
    surface: "web",
    conversationId: input.conversationId,
    organizationId: input.toolContext.organizationId,
    localUserId: input.toolContext.localUserId,
    membershipRole: input.toolContext.membershipRole,
    projectId: input.toolContext.projectId,
    messageText: input.messageText,
    hasTranslationAttachments: input.hasTranslationAttachments,
    repositorySource: "chat_ui",
    db: input.toolContext.db,
  });

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
