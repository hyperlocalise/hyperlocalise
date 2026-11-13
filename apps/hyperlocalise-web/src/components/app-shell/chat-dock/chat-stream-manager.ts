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
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";

import { apiClient } from "@/lib/api-client-instance";
import { isAiCreditExhaustedError } from "@/lib/billing/ai-credit-refusal";

import { CHAT_DOCK_MAX_CONCURRENT_STREAMS } from "./chat-dock-persistence";
import type { ChatDockStore, ChatDockStreamSnapshot } from "./chat-dock-store";
import { createChatRunApi, type ChatRunApi } from "./chat-run-api";

const streamErrorMessage = "Sorry, I encountered an error while generating a response.";

/** How often a client following a turn it is not streaming reads the server's snapshot. */
export const CHAT_RUN_POLL_INTERVAL_MS = 1_000;
/** Consecutive failed snapshot reads before the client gives up on a turn. */
const CHAT_RUN_MAX_POLL_FAILURES = 5;

export type ChatStreamStartInput = {
  conversationId: string;
  responseToMessageId: string;
  text: string;
};

export type ChatStreamStartResult =
  | { started: true }
  | { started: false; reason: "already_streaming" | "max_streams" };

export type ChatStreamFinishedInfo = {
  /** The user stopped the turn. Queued follow-ups wait instead of sending. */
  cancelled: boolean;
};

type ActiveStream = {
  conversationId: string;
  controller: AbortController;
};

type RunFollowResult = "finished" | "failed" | "aborted";

function createAssistantMessage(id: string, text = ""): UIMessage {
  return {
    id,
    role: "assistant",
    parts: text ? [{ type: "text", text, state: "done" }] : [],
  };
}

/** The `error` code of a failed chat request, from the JSON body the AI SDK transport keeps. */
function chatRequestErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("responseBody" in error)) {
    return null;
  }
  const responseBody = (error as { responseBody?: unknown }).responseBody;
  if (typeof responseBody !== "string") {
    return null;
  }
  try {
    const body: unknown = JSON.parse(responseBody);
    return body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : null;
  } catch {
    return null;
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Streams agent replies into the chat dock store. The server owns each turn: closing the stream
 * here does not stop it. When the stream breaks, or another tab already started the turn, the
 * manager follows the turn by reading the server's snapshot until it ends.
 */
export class ChatStreamManager {
  private readonly organizationSlug: string;
  private readonly store: ChatDockStore;
  private readonly requestHeaders: Record<string, string> | undefined;
  private readonly runApi: ChatRunApi;
  private readonly pollIntervalMs: number;
  private readonly activeStreams = new Map<string, ActiveStream>();
  /**
   * User message ids that already triggered an assistant stream attempt.
   * Survives remounts so success and error both block unbounded auto-retry.
   */
  private readonly attemptedUserMessageIds = new Map<string, string>();
  private readonly cancelledConversationIds = new Set<string>();
  private onStreamFinished:
    | ((conversationId: string, info: ChatStreamFinishedInfo) => void | Promise<void>)
    | null = null;

  constructor(
    organizationSlug: string,
    store: ChatDockStore,
    options?: { headers?: Record<string, string>; runApi?: ChatRunApi; pollIntervalMs?: number },
  ) {
    this.organizationSlug = organizationSlug;
    this.store = store;
    this.requestHeaders = options?.headers;
    this.runApi = options?.runApi ?? createChatRunApi(apiClient, organizationSlug);
    this.pollIntervalMs = options?.pollIntervalMs ?? CHAT_RUN_POLL_INTERVAL_MS;
  }

  setOnStreamFinished(
    handler:
      | ((conversationId: string, info: ChatStreamFinishedInfo) => void | Promise<void>)
      | null,
  ) {
    this.onStreamFinished = handler;
  }

  get activeCount() {
    return this.activeStreams.size;
  }

  isStreaming(conversationId: string) {
    return this.activeStreams.has(conversationId);
  }

  isCancelling(conversationId: string) {
    return this.cancelledConversationIds.has(conversationId);
  }

  getSnapshot(conversationId: string): ChatDockStreamSnapshot | null {
    return this.store.getStreamSnapshot(conversationId);
  }

  hasAttemptedUserMessage(conversationId: string, userMessageId: string) {
    return this.attemptedUserMessageIds.get(conversationId) === userMessageId;
  }

  markAttemptedUserMessage(conversationId: string, userMessageId: string) {
    this.attemptedUserMessageIds.set(conversationId, userMessageId);
  }

  shouldAutoTriggerResponse(conversationId: string, userMessageId: string) {
    if (this.isStreaming(conversationId)) {
      return false;
    }

    if (this.hasAttemptedUserMessage(conversationId, userMessageId)) {
      return false;
    }

    const snapshot = this.getSnapshot(conversationId);
    return snapshot?.responseToMessageId !== userMessageId;
  }

  /**
   * Stops following a turn in this client. The server keeps running it; use `cancel` to stop it.
   */
  stop(conversationId: string) {
    const active = this.activeStreams.get(conversationId);
    active?.controller.abort();
    this.activeStreams.delete(conversationId);
    // Abort skips onStreamFinished; clear so inbox/dock do not keep a stale "complete" snapshot.
    this.store.clearStreamSnapshot(conversationId);
  }

  /**
   * Asks the server to stop the conversation's turn. The stream keeps reading: the server ends it
   * after saving what the agent produced, and the usual finish handling refetches the messages.
   */
  async cancel(conversationId: string) {
    this.cancelledConversationIds.add(conversationId);
    this.store.setStopping(conversationId, true);
    try {
      const cancelled = await this.runApi.cancelRun(conversationId);
      if (!cancelled && !this.isStreaming(conversationId)) {
        this.clearCancel(conversationId);
      }
      return cancelled;
    } catch (error) {
      this.clearCancel(conversationId);
      throw error;
    }
  }

  private clearCancel(conversationId: string) {
    this.cancelledConversationIds.delete(conversationId);
    this.store.setStopping(conversationId, false);
  }

  /** True when this manager was created with the given store instance. */
  isBoundToStore(store: ChatDockStore) {
    return this.store === store;
  }

  stopAll() {
    const conversationIds = Array.from(this.activeStreams.keys());
    for (const conversationId of conversationIds) {
      this.stop(conversationId);
    }
  }

  async start(input: ChatStreamStartInput): Promise<ChatStreamStartResult> {
    const { conversationId, responseToMessageId, text } = input;

    if (this.activeStreams.has(conversationId)) {
      return { started: false, reason: "already_streaming" };
    }

    if (this.activeStreams.size >= CHAT_DOCK_MAX_CONCURRENT_STREAMS) {
      return { started: false, reason: "max_streams" };
    }

    const controller = new AbortController();
    const messageId = `stream-${responseToMessageId}`;
    this.activeStreams.set(conversationId, { conversationId, controller });
    this.clearCancel(conversationId);
    // Mark before the network call so remounts cannot auto-retry after errors/aborts.
    this.markAttemptedUserMessage(conversationId, responseToMessageId);

    this.store.setStreamSnapshot(conversationId, {
      conversationId,
      responseToMessageId,
      message: createAssistantMessage(messageId),
      status: "streaming",
    });

    let finishedSuccessfully = false;

    try {
      const transport = new DefaultChatTransport({
        api: `/api/orgs/${this.organizationSlug}/conversations/${conversationId}/chat`,
        headers: this.requestHeaders,
      });

      const chunkStream = await transport.sendMessages({
        abortSignal: controller.signal,
        chatId: conversationId,
        messageId: undefined,
        messages: [
          {
            id: responseToMessageId,
            role: "user",
            parts: [{ type: "text", text }],
          },
        ],
        trigger: "submit-message",
      });

      let latestMessage: UIMessage | null = null;
      const messageStream = readUIMessageStream({
        message: createAssistantMessage(messageId),
        stream: chunkStream,
        terminateOnError: true,
      });

      for await (const nextMessage of messageStream) {
        latestMessage = nextMessage;
        this.store.setStreamSnapshot(conversationId, {
          conversationId,
          responseToMessageId,
          message: nextMessage,
          status: "streaming",
        });
      }

      finishedSuccessfully = true;
      this.store.setStreamSnapshot(conversationId, {
        conversationId,
        responseToMessageId,
        message: latestMessage ?? createAssistantMessage(messageId),
        status: "complete",
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        return { started: true };
      }

      const code = chatRequestErrorCode(error);
      if (isAiCreditExhaustedError(error)) {
        this.store.setStreamSnapshot(conversationId, {
          conversationId,
          responseToMessageId,
          message: createAssistantMessage(messageId),
          status: "error",
          aiCreditExhausted: true,
        });
      } else if (code === "turn_already_processed") {
        // Another tab or an earlier attempt answered it; the refetch shows the reply.
        finishedSuccessfully = true;
      } else {
        // The turn may be running on the server already (another tab, or our stream broke
        // mid-reply). Follow it there before reporting an error.
        const followed = await this.followRun({
          conversationId,
          responseToMessageId,
          messageId,
          signal: controller.signal,
        });
        if (followed === "aborted") {
          return { started: true };
        }
        if (followed === "finished") {
          finishedSuccessfully = true;
        } else {
          if (code !== "run_in_progress") {
            console.error("Chat stream error:", error);
          }
          this.store.setStreamSnapshot(conversationId, {
            conversationId,
            responseToMessageId,
            message: createAssistantMessage(messageId, streamErrorMessage),
            status: "error",
          });
        }
      }
    } finally {
      const active = this.activeStreams.get(conversationId);
      if (active?.controller === controller) {
        this.activeStreams.delete(conversationId);
      }

      // Success and error both need query invalidation + snapshot clear. Abort is handled by
      // stop()/clearStreamSnapshot and must not re-enter onStreamFinished here. A refusal keeps
      // its snapshot so the conversation goes on showing it; nothing was saved to refetch.
      const snapshot = this.store.getStreamSnapshot(conversationId);
      const cancelled = this.isCancelling(conversationId);
      this.clearCancel(conversationId);
      if (
        !controller.signal.aborted &&
        (finishedSuccessfully || (snapshot?.status === "error" && !snapshot.aiCreditExhausted))
      ) {
        await this.onStreamFinished?.(conversationId, { cancelled });
      }
    }

    return { started: true };
  }

  /** Reads the server's snapshot of the turn answering `responseToMessageId` until it ends. */
  private async followRun(input: {
    conversationId: string;
    responseToMessageId: string;
    messageId: string;
    signal: AbortSignal;
  }): Promise<RunFollowResult> {
    let failures = 0;
    while (!input.signal.aborted) {
      let run;
      try {
        run = await this.runApi.getRun(input.conversationId);
        failures = 0;
      } catch {
        failures += 1;
        if (failures >= CHAT_RUN_MAX_POLL_FAILURES) {
          return "failed";
        }
        await sleep(this.pollIntervalMs, input.signal);
        continue;
      }

      if (input.signal.aborted) {
        return "aborted";
      }

      if (!run || run.userMessageId !== input.responseToMessageId) {
        return "failed";
      }

      if (run.status !== "running") {
        return run.status === "failed" ? "failed" : "finished";
      }

      this.store.setStreamSnapshot(input.conversationId, {
        conversationId: input.conversationId,
        responseToMessageId: input.responseToMessageId,
        message: { id: input.messageId, role: "assistant", parts: run.parts },
        status: "streaming",
      });
      await sleep(this.pollIntervalMs, input.signal);
    }

    return "aborted";
  }
}

const managers = new Map<string, ChatStreamManager>();

export function getChatStreamManager(organizationSlug: string, store: ChatDockStore) {
  const existing = managers.get(organizationSlug);
  if (existing) {
    if (existing.isBoundToStore(store)) {
      return existing;
    }
    // Remounts / test isolation can pass a fresh store for the same slug. Never return a
    // manager still wired to the previous store — dispose and recreate instead.
    console.warn(
      `getChatStreamManager("${organizationSlug}"): replacing manager bound to a different ChatDockStore`,
    );
    disposeChatStreamManager(organizationSlug);
  }

  const manager = new ChatStreamManager(organizationSlug, store);
  managers.set(organizationSlug, manager);
  return manager;
}

export function disposeChatStreamManager(organizationSlug: string) {
  const manager = managers.get(organizationSlug);
  if (!manager) {
    return;
  }

  manager.stopAll();
  managers.delete(organizationSlug);
}

/** Test-only: reset module-level manager cache between cases. */
export function resetChatStreamManagersForTests() {
  for (const slug of Array.from(managers.keys())) {
    disposeChatStreamManager(slug);
  }
}
