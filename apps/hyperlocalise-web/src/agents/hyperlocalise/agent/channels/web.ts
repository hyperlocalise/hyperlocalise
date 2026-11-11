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
  generateId,
  readUIMessageStream,
  type InferUIMessageChunk,
  type UIMessage,
} from "ai";

import {
  PERSISTED_INBOX_CHAT_DATA_PART_TYPES,
  type InboxChatUIMessage,
} from "@/lib/agent-contracts/inbox-chat-message";
import { compactToolOutput } from "@/lib/agent-contracts/tool-output-compaction";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import {
  addAiTokenUsage,
  extractAiSdkTokenUsage,
  reserveAgentRuntimeUsage,
  trackSucceededAgentRuntimeUsage,
} from "@/lib/billing/agent-runtime-usage";
import type { AiTokenUsage } from "@/lib/billing/usage-control";
import {
  finishConversationRun,
  saveConversationRunSnapshot,
  saveInteractionMessageToolOutputs,
} from "@/lib/conversations/conversation-runs";
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
import type { ResolvedAgentLanguageModel } from "@/lib/providers/language-model";

type InboxChatChunk = InferUIMessageChunk<InboxChatUIMessage>;

/** How often a running turn saves its reply so far and checks for a stop request. */
const RUN_SNAPSHOT_INTERVAL_MS = 1_000;

const INTERRUPTED_FALLBACK_TEXT = "(stopped)";

function textFromParts(parts: UIMessage["parts"]) {
  return parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

/** Parts kept in the stored message: live-only status and progress parts are dropped. */
function persistableParts(parts: UIMessage["parts"]): UIMessage["parts"] {
  return parts.filter(
    (part) => !part.type.startsWith("data-") || PERSISTED_INBOX_CHAT_DATA_PART_TYPES.has(part.type),
  );
}

async function writeAssistantText(
  writer: { write: (chunk: InboxChatChunk) => void },
  text: string,
  options?: string[],
) {
  const messageId = generateId();
  const id = generateId();
  writer.write({ type: "start", messageId });
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
  if (options && options.length > 0) {
    writer.write({
      type: "data-clarification",
      id: `clarification-${id}`,
      data: { question: text, options },
    });
  }
  writer.write({ type: "finish" });
}

/**
 * Sends a shortened copy of each large tool result to the chat and keeps the full result in
 * `fullOutputs`, keyed by tool call id, so it can be stored next to the message.
 */
function createToolOutputCompactionTransform(fullOutputs: Map<string, unknown>) {
  return new TransformStream<InboxChatChunk, InboxChatChunk>({
    transform(chunk, controller) {
      if (chunk.type !== "tool-output-available" || chunk.preliminary) {
        controller.enqueue(chunk);
        return;
      }

      const compacted = compactToolOutput(chunk.output);
      if (compacted.omitted === 0) {
        controller.enqueue(chunk);
        return;
      }

      fullOutputs.set(chunk.toolCallId, chunk.output);
      controller.enqueue({ ...chunk, output: compacted.output });
      controller.enqueue({
        type: "data-toolOutputTruncated",
        id: `tool-output-truncated-${chunk.toolCallId}`,
        data: { toolCallId: chunk.toolCallId, omitted: compacted.omitted },
      });
    },
  });
}

type ConversationRunOutcome = {
  failed: boolean;
  agentMessageId: string | null;
};

/**
 * Reads the turn to the end whether or not a client is still listening. Saves the reply so far
 * on an interval, which also stops the turn when someone asked to, then records how it ended.
 */
async function driveConversationRun(input: {
  runId: string;
  stream: ReadableStream<InboxChatChunk>;
  abortController: AbortController;
  ended: Promise<void>;
  getOutcome: () => ConversationRunOutcome;
}) {
  let latestParts: UIMessage["parts"] | null = null;
  let dirty = false;
  const pending: { flush: Promise<void> | null } = { flush: null };
  let streamFailed = false;
  let streamErrored = false;

  const flush = async () => {
    const parts = dirty ? latestParts : null;
    dirty = false;
    try {
      const { cancelRequested } = await saveConversationRunSnapshot({
        runId: input.runId,
        parts,
      });
      if (cancelRequested && !input.abortController.signal.aborted) {
        input.abortController.abort();
      }
    } catch (error) {
      console.error("[web-agent] Failed to save conversation run snapshot", {
        runId: input.runId,
        err: error instanceof Error ? error.message : "unknown",
      });
    }
  };

  const timer = setInterval(() => {
    if (!pending.flush) {
      pending.flush = flush().finally(() => {
        pending.flush = null;
      });
    }
  }, RUN_SNAPSHOT_INTERVAL_MS);

  try {
    for await (const message of readUIMessageStream<InboxChatUIMessage>({
      stream: input.stream,
      onError: () => {
        streamFailed = true;
      },
    })) {
      latestParts = message.parts;
      dirty = true;
    }
  } catch (error) {
    streamFailed = true;
    streamErrored = true;
    console.error("[web-agent] Conversation run stream failed", {
      runId: input.runId,
      err: error instanceof Error ? error.message : "unknown",
    });
  } finally {
    clearInterval(timer);
    await pending.flush;
  }

  // An errored stream never reaches `onEnd`, so `ended` would never settle.
  if (!streamErrored) {
    await input.ended;
  }
  const outcome = input.getOutcome();
  // A turn that stored no reply is failed, so the user can send the same message again.
  const status = input.abortController.signal.aborted
    ? "interrupted"
    : outcome.failed || streamFailed || !outcome.agentMessageId
      ? "failed"
      : "completed";

  try {
    await finishConversationRun({
      runId: input.runId,
      status,
      agentMessageId: outcome.agentMessageId,
    });
  } catch (error) {
    console.error("[web-agent] Failed to finish conversation run", {
      runId: input.runId,
      status,
      err: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function prepareAndCommitWebConversationTurn(
  conversationId: string,
  prepareInput: Omit<PrepareConversationAgentTurnInput, "repositorySession">,
): Promise<PrepareConversationAgentTurnResult> {
  let repositorySessionState = await getWebConversationRepositorySession(conversationId);
  let classificationTokenUsage: AiTokenUsage | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const prepared = await prepareConversationAgentTurn({
      ...prepareInput,
      repositorySession: repositorySessionState?.session ?? null,
    });
    classificationTokenUsage = addAiTokenUsage(
      classificationTokenUsage,
      prepared.classificationTokenUsage,
    );

    if (!prepared.updatedRepositorySession) {
      return { ...prepared, classificationTokenUsage };
    }

    const committed = await setWebConversationRepositorySession(conversationId, {
      organizationId: prepareInput.organizationId,
      baseVersion: repositorySessionState?.version ?? null,
      session: prepared.updatedRepositorySession,
    });

    if (committed) {
      return { ...prepared, classificationTokenUsage };
    }

    repositorySessionState = await getWebConversationRepositorySession(conversationId);
  }

  const fallbackSession = await getWebConversationRepositorySession(conversationId);
  const prepared = await prepareConversationAgentTurn({
    ...prepareInput,
    repositorySession: fallbackSession?.session ?? null,
    reuseCommittedRepositorySandboxOnly: true,
  });
  return {
    ...prepared,
    classificationTokenUsage: addAiTokenUsage(
      classificationTokenUsage,
      prepared.classificationTokenUsage,
    ),
  };
}

/**
 * Streams one agent turn to the client. The turn belongs to the conversation run `runId`, not to
 * the request: a client that disconnects does not stop it, and only a cancel request on the run
 * does. The reply is saved as it streams so other clients can resume it.
 */
export function createWebChatAgentUIStreamResponse(input: {
  conversationId: string;
  runId: string;
  messageText: string;
  toolContext: ToolContext;
  hasTranslationAttachments: boolean;
  usageOperationKey?: string;
  languageModel?: ResolvedAgentLanguageModel;
  /** Keeps the process alive until the turn ends (Next's `after()`). */
  deferAfterResponse?: (task: () => Promise<unknown>) => void;
}) {
  const runAbortController = new AbortController();
  let persistedDuringExecute = false;
  let agentMessageId: string | null = null;
  let turnFailed = false;
  let releaseSandboxLease: (() => void) | null = null;
  const fullToolOutputs = new Map<string, unknown>();
  const usageOperationKey =
    input.usageOperationKey ?? `chat-agent-turn:${input.conversationId}:${randomUUID()}`;
  let usageDimensions: Record<string, string | number | boolean | null> = {
    surface: "web",
    agent_surface: "chat",
    repository_tools: false,
  };
  let shouldTrackUsage = false;
  let classificationTokenUsage: AiTokenUsage | null = null;
  let agentTokenUsagePromise: Promise<AiTokenUsage | null> | null = null;
  let resolveEnded: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });

  const stream = createUIMessageStream<InboxChatUIMessage>({
    execute: async ({ writer }) => {
      writer.write({
        type: "data-status",
        id: "prep",
        data: { message: "Setting up workspace…" },
      });

      const prepared = await prepareAndCommitWebConversationTurn(input.conversationId, {
        surface: "web",
        conversationId: input.conversationId,
        organizationId: input.toolContext.organizationId,
        localUserId: input.toolContext.localUserId,
        membershipRole: input.toolContext.membershipRole,
        projectId: input.toolContext.projectId,
        messageText: input.messageText,
        hasTranslationAttachments: input.hasTranslationAttachments,
        knowledgeMemoryEnabled: input.toolContext.knowledgeMemoryEnabled === true,
        glossarySearchEnabled: input.toolContext.glossarySearchEnabled === true,
        repositorySource: "chat_ui",
        db: input.toolContext.db,
        reportToolProgress: ({ toolCallId, message }) => {
          writer.write({
            type: "data-toolProgress",
            id: toolCallId,
            data: { toolCallId, message },
          });
        },
        languageModel: input.languageModel,
      });
      classificationTokenUsage = prepared.classificationTokenUsage;

      if (prepared.clarificationFollowUp) {
        const options = prepared.clarificationOptions ?? [];
        await writeAssistantText(writer, prepared.clarificationFollowUp, options);
        const message = await addInteractionMessage({
          interactionId: input.conversationId,
          senderType: "agent",
          text: prepared.clarificationFollowUp,
          parts: [
            { type: "text", text: prepared.clarificationFollowUp },
            ...(options.length > 0
              ? [
                  {
                    type: "data-clarification" as const,
                    data: { question: prepared.clarificationFollowUp, options },
                  },
                ]
              : []),
          ],
        });
        agentMessageId = message?.id ?? null;
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
      });

      try {
        const result = await prepared.agent.stream({
          messages: prepared.chatMessages,
          abortSignal: runAbortController.signal,
        });
        agentTokenUsagePromise = Promise.resolve(result.usage).then(extractAiSdkTokenUsage);

        writer.merge(
          result
            .toUIMessageStream({
              sendReasoning: true,
              sendStart: true,
            })
            .pipeThrough(createToolOutputCompactionTransform(fullToolOutputs)),
        );
      } catch (error) {
        releaseSandboxLease?.();
        releaseSandboxLease = null;
        throw error;
      }
    },
    onEnd: async ({ responseMessage, isAborted }) => {
      // A stop can also surface as an error thrown by the agent rather than an abort chunk.
      const interrupted = isAborted || runAbortController.signal.aborted;
      try {
        if (!persistedDuringExecute) {
          agentMessageId = await persistAssistantMessage({
            conversationId: input.conversationId,
            organizationId: input.toolContext.organizationId,
            parts: responseMessage.parts,
            interrupted,
            fullToolOutputs,
          });
        }

        if (shouldTrackUsage && !interrupted) {
          try {
            const agentTokenUsage = agentTokenUsagePromise
              ? await agentTokenUsagePromise.catch(() => null)
              : null;
            const tokenUsage = addAiTokenUsage(classificationTokenUsage, agentTokenUsage);
            await trackSucceededAgentRuntimeUsage({
              organizationId: input.toolContext.organizationId,
              operationKey: usageOperationKey,
              dimensions: usageDimensions,
              tokenUsage,
              aiCreditModelId: tokenUsage ? input.languageModel?.modelId : undefined,
              aiCreditCredentialSource: tokenUsage
                ? input.languageModel?.source === "gateway"
                  ? "gateway"
                  : "byok"
                : undefined,
              interactionId: input.conversationId,
            });
          } catch (error) {
            console.error("[web-agent] Failed to track agent runtime usage", {
              organizationId: input.toolContext.organizationId,
              operationKey: usageOperationKey,
              err: error instanceof Error ? error.message : "unknown",
            });
          }
        }
      } finally {
        releaseSandboxLease?.();
        releaseSandboxLease = null;
        resolveEnded();
      }
    },
    onError: () => {
      turnFailed = true;
      return "Sorry, I encountered an error while generating a response.";
    },
  });

  // One branch goes to the client and may be dropped when it disconnects; the other reads the
  // turn to the end so it finishes and is saved either way.
  const [clientStream, runStream] = stream.tee();
  const runDone = driveConversationRun({
    runId: input.runId,
    stream: runStream,
    abortController: runAbortController,
    ended,
    getOutcome: () => ({ failed: turnFailed, agentMessageId }),
  });
  if (input.deferAfterResponse) {
    input.deferAfterResponse(() => runDone);
  } else {
    void runDone;
  }

  return createUIMessageStreamResponse({ stream: clientStream });
}

/** Stores the reply, marking a stopped one, and returns its message id. */
async function persistAssistantMessage(input: {
  conversationId: string;
  organizationId: string;
  parts: UIMessage["parts"];
  interrupted: boolean;
  fullToolOutputs: ReadonlyMap<string, unknown>;
}): Promise<string | null> {
  const parts = persistableParts(input.parts);
  const text = textFromParts(parts).trim();
  // A turn stopped before any output still gets a "Stopped" reply, so it shows as stopped.
  if (!text && parts.length === 0 && !input.interrupted) {
    return null;
  }

  const storedParts: UIMessage["parts"] = input.interrupted
    ? [...parts, { type: "data-interrupted", data: { reason: "user_cancelled" } }]
    : parts.length > 0
      ? parts
      : [{ type: "text", text }];
  const fallbackText = input.interrupted ? INTERRUPTED_FALLBACK_TEXT : "(no response)";

  try {
    const message = await addInteractionMessage({
      interactionId: input.conversationId,
      senderType: "agent",
      text: text || fallbackText,
      parts: storedParts,
    });
    const messageId = message?.id ?? null;
    if (messageId && input.fullToolOutputs.size > 0) {
      await saveInteractionMessageToolOutputs({ messageId, outputs: input.fullToolOutputs });
    }
    return messageId;
  } catch (error) {
    console.error("[web-agent] Failed to persist assistant message", {
      conversationId: input.conversationId,
      organizationId: input.organizationId,
      err: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
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
    messageText: input.messageText,
    hasTranslationAttachments: input.hasTranslationAttachments,
    knowledgeMemoryEnabled: input.toolContext.knowledgeMemoryEnabled === true,
    glossarySearchEnabled: input.toolContext.glossarySearchEnabled === true,
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
