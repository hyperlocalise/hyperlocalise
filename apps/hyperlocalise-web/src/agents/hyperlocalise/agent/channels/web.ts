import { randomUUID } from "node:crypto";
import type { Thread } from "chat";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import {
  reserveAgentRuntimeUsage,
  trackSucceededAgentRuntimeUsage,
} from "@/lib/billing/agent-runtime-usage";
import { addInteractionMessage } from "@/lib/conversations/interactions";
import {
  acquireWebRepositorySandboxLease,
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

async function* streamWithSandboxLeaseRelease(
  stream: AsyncIterable<string>,
  releaseLease: () => void,
) {
  try {
    for await (const chunk of stream) {
      yield chunk;
    }
  } finally {
    releaseLease();
  }
}

async function* streamWithUsageTracking(
  stream: AsyncIterable<string>,
  input: {
    organizationId: string;
    operationKey: string;
    dimensions: Record<string, string | number | boolean | null>;
  },
) {
  for await (const chunk of stream) {
    yield chunk;
  }

  await trackSucceededAgentRuntimeUsage(input);
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
  usageOperationKey?: string;
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

  const releaseSandboxLease = prepared.repositorySandboxId
    ? acquireWebRepositorySandboxLease(prepared.repositorySandboxId)
    : null;
  const usageOperationKey =
    input.usageOperationKey ?? `chat-agent-turn:${input.conversationId}:${randomUUID()}`;
  const usageDimensions = {
    surface: "web",
    agent_surface: "chat",
    repository_tools: Boolean(prepared.repositorySandboxId),
  };

  try {
    await reserveAgentRuntimeUsage({
      organizationId: input.toolContext.organizationId,
      operationKey: usageOperationKey,
      source: "chat_agent_turn",
      interactionId: input.conversationId,
      dimensions: usageDimensions,
    });

    const result = await prepared.agent.stream({ messages: prepared.chatMessages });
    const trackedStream = streamWithUsageTracking(result.textStream, {
      organizationId: input.toolContext.organizationId,
      operationKey: usageOperationKey,
      dimensions: usageDimensions,
    });

    return {
      classification: prepared.classification,
      clarificationFollowUp: null,
      textStream: releaseSandboxLease
        ? streamWithSandboxLeaseRelease(trackedStream, releaseSandboxLease)
        : trackedStream,
    };
  } catch (error) {
    releaseSandboxLease?.();
    throw error;
  }
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
