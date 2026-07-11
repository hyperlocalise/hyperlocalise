import { randomUUID } from "node:crypto";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  type InferUIMessageChunk,
  type UIMessage,
} from "ai";

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

export type InboxChatStatusData = {
  message: string;
};

export type InboxChatUIMessage = UIMessage<never, { status: InboxChatStatusData }>;

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

async function writeAssistantText(
  writer: { write: (chunk: InferUIMessageChunk<InboxChatUIMessage>) => void },
  text: string,
) {
  const messageId = generateId();
  const id = generateId();
  writer.write({ type: "start", messageId });
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
  writer.write({ type: "finish" });
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

export function createWebChatAgentUIStreamResponse(input: {
  conversationId: string;
  messageText: string;
  toolContext: ToolContext;
  hasTranslationAttachments: boolean;
  usageOperationKey?: string;
  abortSignal?: AbortSignal;
}) {
  let persistedDuringExecute = false;
  let releaseSandboxLease: (() => void) | null = null;
  const usageOperationKey =
    input.usageOperationKey ?? `chat-agent-turn:${input.conversationId}:${randomUUID()}`;
  let usageDimensions: Record<string, string | number | boolean | null> = {
    surface: "web",
    agent_surface: "chat",
    repository_tools: false,
  };
  let shouldTrackUsage = false;

  const stream = createUIMessageStream<InboxChatUIMessage>({
    execute: async ({ writer }) => {
      writer.write({
        type: "data-status",
        id: "prep",
        data: { message: "Preparing…" },
        transient: true,
      });

      const prepared = await prepareAndCommitWebConversationTurn(input.conversationId, {
        surface: "web",
        conversationId: input.conversationId,
        organizationId: input.toolContext.organizationId,
        localUserId: input.toolContext.localUserId,
        membershipRole: input.toolContext.membershipRole,
        projectId: input.toolContext.projectId,
        knowledgeMemoryEnabled: input.toolContext.knowledgeMemoryEnabled,
        messageText: input.messageText,
        hasTranslationAttachments: input.hasTranslationAttachments,
        repositorySource: "chat_ui",
        db: input.toolContext.db,
      });

      if (prepared.clarificationFollowUp) {
        await writeAssistantText(writer, prepared.clarificationFollowUp);
        await addInteractionMessage({
          interactionId: input.conversationId,
          senderType: "agent",
          text: prepared.clarificationFollowUp,
          parts: [{ type: "text", text: prepared.clarificationFollowUp }],
        });
        persistedDuringExecute = true;
        return;
      }

      releaseSandboxLease = prepared.repositorySandboxId
        ? acquireWebRepositorySandboxLease(prepared.repositorySandboxId)
        : null;
      usageDimensions = {
        surface: "web",
        agent_surface: "chat",
        repository_tools: Boolean(prepared.repositorySandboxId),
      };

      await reserveAgentRuntimeUsage({
        organizationId: input.toolContext.organizationId,
        operationKey: usageOperationKey,
        source: "chat_agent_turn",
        interactionId: input.conversationId,
        dimensions: usageDimensions,
      });
      shouldTrackUsage = true;

      writer.write({
        type: "data-status",
        id: "prep",
        data: { message: "Thinking…" },
        transient: true,
      });

      try {
        const result = await prepared.agent.stream({
          messages: prepared.chatMessages,
          abortSignal: input.abortSignal,
        });

        writer.merge(
          result.toUIMessageStream({
            sendReasoning: true,
            sendStart: true,
          }),
        );
      } catch (error) {
        releaseSandboxLease?.();
        releaseSandboxLease = null;
        throw error;
      }
    },
    onFinish: async ({ responseMessage, isAborted }) => {
      try {
        if (!isAborted && !persistedDuringExecute) {
          const parts = persistableParts(responseMessage.parts);
          const text = textFromParts(parts).trim();
          if (text || parts.length > 0) {
            await addInteractionMessage({
              interactionId: input.conversationId,
              senderType: "agent",
              text: text || "(no response)",
              parts: parts.length > 0 ? parts : [{ type: "text", text: text || "(no response)" }],
            });
          }
        }

        if (shouldTrackUsage && !isAborted) {
          await trackSucceededAgentRuntimeUsage({
            organizationId: input.toolContext.organizationId,
            operationKey: usageOperationKey,
            dimensions: usageDimensions,
          });
        }
      } finally {
        releaseSandboxLease?.();
        releaseSandboxLease = null;
      }
    },
    onError: () => "Sorry, I encountered an error while generating a response.",
  });

  return createUIMessageStreamResponse({ stream });
}

/** @internal Exported for unit tests covering repository session commit retries. */
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
    knowledgeMemoryEnabled: input.toolContext.knowledgeMemoryEnabled,
    messageText: input.messageText,
    hasTranslationAttachments: input.hasTranslationAttachments,
    repositorySource: "chat_ui",
    db: input.toolContext.db,
  });

  if (prepared.clarificationFollowUp) {
    return {
      classification: prepared.classification,
      clarificationFollowUp: prepared.clarificationFollowUp,
      textStream: null as AsyncIterable<string> | null,
    };
  }

  const releaseLease = prepared.repositorySandboxId
    ? acquireWebRepositorySandboxLease(prepared.repositorySandboxId)
    : null;
  const operationKey =
    input.usageOperationKey ?? `chat-agent-turn:${input.conversationId}:${randomUUID()}`;
  const dimensions = {
    surface: "web",
    agent_surface: "chat",
    repository_tools: Boolean(prepared.repositorySandboxId),
  };

  try {
    await reserveAgentRuntimeUsage({
      organizationId: input.toolContext.organizationId,
      operationKey,
      source: "chat_agent_turn",
      interactionId: input.conversationId,
      dimensions,
    });

    const result = await prepared.agent.stream({ messages: prepared.chatMessages });

    async function* trackedTextStream() {
      try {
        for await (const chunk of result.textStream) {
          yield chunk;
        }
        await trackSucceededAgentRuntimeUsage({
          organizationId: input.toolContext.organizationId,
          operationKey,
          dimensions,
        });
      } finally {
        releaseLease?.();
      }
    }

    return {
      classification: prepared.classification,
      clarificationFollowUp: null as string | null,
      textStream: trackedTextStream(),
    };
  } catch (error) {
    releaseLease?.();
    throw error;
  }
}
