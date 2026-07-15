import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";

import { CHAT_DOCK_MAX_CONCURRENT_STREAMS } from "./chat-dock-persistence";
import type { ChatDockStore, ChatDockStreamSnapshot } from "./chat-dock-store";

const streamErrorMessage = "Sorry, I encountered an error while generating a response.";

export type ChatStreamStartInput = {
  conversationId: string;
  responseToMessageId: string;
  text: string;
};

export type ChatStreamStartResult =
  | { started: true }
  | { started: false; reason: "already_streaming" | "max_streams" };

type ActiveStream = {
  conversationId: string;
  controller: AbortController;
};

function createAssistantMessage(id: string, text = ""): UIMessage {
  return {
    id,
    role: "assistant",
    parts: text ? [{ type: "text", text, state: "done" }] : [],
  };
}

export class ChatStreamManager {
  private readonly organizationSlug: string;
  private readonly store: ChatDockStore;
  private readonly activeStreams = new Map<string, ActiveStream>();
  private onStreamFinished: ((conversationId: string) => void | Promise<void>) | null = null;

  constructor(organizationSlug: string, store: ChatDockStore) {
    this.organizationSlug = organizationSlug;
    this.store = store;
  }

  setOnStreamFinished(handler: ((conversationId: string) => void | Promise<void>) | null) {
    this.onStreamFinished = handler;
  }

  get activeCount() {
    return this.activeStreams.size;
  }

  isStreaming(conversationId: string) {
    return this.activeStreams.has(conversationId);
  }

  getSnapshot(conversationId: string): ChatDockStreamSnapshot | null {
    return this.store.getStreamSnapshot(conversationId);
  }

  stop(conversationId: string) {
    const active = this.activeStreams.get(conversationId);
    active?.controller.abort();
    this.activeStreams.delete(conversationId);
    // Abort skips onStreamFinished; clear so inbox/dock do not keep a stale "complete" snapshot.
    this.store.clearStreamSnapshot(conversationId);
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

    const initialSnapshot: ChatDockStreamSnapshot = {
      conversationId,
      responseToMessageId,
      message: createAssistantMessage(messageId),
      status: "streaming",
    };
    this.store.setStreamSnapshot(conversationId, initialSnapshot);

    let finishedSuccessfully = false;

    try {
      const transport = new DefaultChatTransport({
        api: `/api/orgs/${this.organizationSlug}/conversations/${conversationId}/chat`,
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
      if (error instanceof Error && error.name === "AbortError") {
        return { started: true };
      }

      console.error("Chat stream error:", error);
      this.store.setStreamSnapshot(conversationId, {
        conversationId,
        responseToMessageId,
        message: createAssistantMessage(messageId, streamErrorMessage),
        status: "error",
      });
    } finally {
      const active = this.activeStreams.get(conversationId);
      if (active?.controller === controller) {
        this.activeStreams.delete(conversationId);
      }

      if (finishedSuccessfully) {
        await this.onStreamFinished?.(conversationId);
      }
    }

    return { started: true };
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
