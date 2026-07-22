/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { UIMessage } from "ai";

import { CHAT_DOCK_MAX_CONCURRENT_STREAMS } from "./chat-dock-persistence";
import { ChatDockStore } from "./chat-dock-store";
import {
  ChatStreamManager,
  disposeChatStreamManager,
  getChatStreamManager,
} from "./chat-stream-manager";

const { readUIMessageStreamMock, sendMessagesMock } = vi.hoisted(() => ({
  readUIMessageStreamMock: vi.fn(),
  sendMessagesMock: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const mod = await importOriginal<typeof import("ai")>();
  return {
    ...mod,
    DefaultChatTransport: class {
      sendMessages(...args: unknown[]) {
        return sendMessagesMock(...args);
      }
    },
    readUIMessageStream: readUIMessageStreamMock,
  };
});

async function* createMessageStream(messages: UIMessage[]) {
  for (const message of messages) {
    yield message;
  }
}

function createAssistantMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text, state: "done" }],
  };
}

describe("ChatStreamManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a fourth concurrent stream before calling the network", async () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    for (const id of ["a", "b", "c", "d"]) {
      store.openTab({ id, title: id });
    }

    const manager = new ChatStreamManager("acme", store);
    const activeStreams = (
      manager as unknown as {
        activeStreams: Map<string, { conversationId: string; controller: AbortController }>;
      }
    ).activeStreams;

    for (const id of ["a", "b", "c"]) {
      activeStreams.set(id, { conversationId: id, controller: new AbortController() });
      store.setStreamSnapshot(id, {
        conversationId: id,
        responseToMessageId: `msg_${id}`,
        message: { id: `stream-msg_${id}`, role: "assistant", parts: [] },
        status: "streaming",
      });
    }

    expect(manager.activeCount).toBe(CHAT_DOCK_MAX_CONCURRENT_STREAMS);

    const result = await manager.start({
      conversationId: "d",
      responseToMessageId: "msg_d",
      text: "hello",
    });

    expect(result).toEqual({
      started: false,
      reason: "max_streams",
    });
    expect(manager.isStreaming("d")).toBe(false);
  });

  it("does not restart an in-flight stream for the same conversation", async () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    const manager = new ChatStreamManager("acme", store);
    const activeStreams = (
      manager as unknown as {
        activeStreams: Map<string, { conversationId: string; controller: AbortController }>;
      }
    ).activeStreams;

    activeStreams.set("conv_1", {
      conversationId: "conv_1",
      controller: new AbortController(),
    });
    store.setStreamSnapshot("conv_1", {
      conversationId: "conv_1",
      responseToMessageId: "msg_1",
      message: { id: "stream-msg_1", role: "assistant", parts: [] },
      status: "streaming",
    });

    const result = await manager.start({
      conversationId: "conv_1",
      responseToMessageId: "msg_2",
      text: "again",
    });

    expect(result).toEqual({ started: false, reason: "already_streaming" });
    expect(store.getStreamSnapshot("conv_1")?.responseToMessageId).toBe("msg_1");
  });

  it("stores stream snapshots without a dock tab", async () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    const manager = new ChatStreamManager("acme", store);

    store.setStreamSnapshot("conv_orphan", {
      conversationId: "conv_orphan",
      responseToMessageId: "msg_1",
      message: { id: "stream-msg_1", role: "assistant", parts: [] },
      status: "streaming",
    });

    expect(store.hasTabs).toBe(false);
    expect(manager.getSnapshot("conv_orphan")?.status).toBe("streaming");
    expect(store.streamingCount).toBe(1);
  });

  it("stops an active stream and clears the snapshot", () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    store.openTab({ id: "conv_1", title: "Chat" });
    store.setStreamSnapshot("conv_1", {
      conversationId: "conv_1",
      responseToMessageId: "msg_1",
      message: { id: "stream-msg_1", role: "assistant", parts: [] },
      status: "streaming",
    });

    const manager = new ChatStreamManager("acme", store);
    const activeStreams = (
      manager as unknown as {
        activeStreams: Map<string, { conversationId: string; controller: AbortController }>;
      }
    ).activeStreams;
    activeStreams.set("conv_1", {
      conversationId: "conv_1",
      controller: new AbortController(),
    });

    manager.stop("conv_1");
    expect(manager.isStreaming("conv_1")).toBe(false);
    expect(store.tabs[0]?.isStreaming).toBe(false);
    expect(store.getStreamSnapshot("conv_1")).toBeNull();
    expect(store.tabs[0]?.streamSnapshot).toBeNull();
  });

  it("clears inbox-only error snapshots via onStreamFinished", async () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    const manager = new ChatStreamManager("acme", store);
    const finished: string[] = [];
    manager.setOnStreamFinished((conversationId) => {
      finished.push(conversationId);
      store.clearStreamSnapshot(conversationId);
    });

    sendMessagesMock.mockRejectedValueOnce(new Error("network down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await manager.start({
      conversationId: "conv_orphan_error",
      responseToMessageId: "msg_1",
      text: "hello",
    });

    expect(result).toEqual({ started: true });
    expect(finished).toEqual(["conv_orphan_error"]);
    expect(store.getStreamSnapshot("conv_orphan_error")).toBeNull();
    expect(manager.isStreaming("conv_orphan_error")).toBe(false);
    expect(store.hasTabs).toBe(false);
    // Failed attempts still count so remounts do not auto-retry the same user message.
    expect(manager.shouldAutoTriggerResponse("conv_orphan_error", "msg_1")).toBe(false);

    consoleError.mockRestore();
  });

  it("calls onStreamFinished after a successful stream so callers can refresh and clear", async () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    const manager = new ChatStreamManager("acme", store);
    const finished: string[] = [];
    manager.setOnStreamFinished((conversationId) => {
      finished.push(conversationId);
      expect(store.getStreamSnapshot(conversationId)?.status).toBe("complete");
      store.clearStreamSnapshot(conversationId);
    });

    const finalMessage = createAssistantMessage("stream-msg_1", "Done");
    sendMessagesMock.mockResolvedValueOnce(createMessageStream([]));
    readUIMessageStreamMock.mockReturnValueOnce(createMessageStream([finalMessage]));

    const result = await manager.start({
      conversationId: "conv_success",
      responseToMessageId: "msg_1",
      text: "hello",
    });

    expect(result).toEqual({ started: true });
    expect(finished).toEqual(["conv_success"]);
    expect(manager.isStreaming("conv_success")).toBe(false);
    expect(store.getStreamSnapshot("conv_success")).toBeNull();
    expect(manager.shouldAutoTriggerResponse("conv_success", "msg_1")).toBe(false);
  });

  it("does not call onStreamFinished after a user-initiated stop aborts the stream", async () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    const manager = new ChatStreamManager("acme", store);
    const finished: string[] = [];
    manager.setOnStreamFinished((conversationId) => {
      finished.push(conversationId);
    });

    let streamStarted!: () => void;
    const streamStartedPromise = new Promise<void>((resolve) => {
      streamStarted = resolve;
    });

    sendMessagesMock.mockImplementationOnce(async (input: { abortSignal: AbortSignal }) => ({
      signal: input.abortSignal,
    }));
    readUIMessageStreamMock.mockImplementationOnce(
      ({ stream }: { stream: { signal: AbortSignal } }) => {
        let didStart = false;
        return {
          [Symbol.asyncIterator]() {
            return this;
          },
          async next(): Promise<IteratorResult<UIMessage>> {
            if (!didStart) {
              didStart = true;
              streamStarted();
            }
            await new Promise<void>((resolve) => {
              stream.signal.addEventListener("abort", () => resolve(), { once: true });
            });
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            throw abortError;
          },
        };
      },
    );

    const startPromise = manager.start({
      conversationId: "conv_abort",
      responseToMessageId: "msg_abort",
      text: "stop please",
    });
    await streamStartedPromise;

    manager.stop("conv_abort");
    await expect(startPromise).resolves.toEqual({ started: true });

    expect(finished).toEqual([]);
    expect(manager.isStreaming("conv_abort")).toBe(false);
    expect(store.getStreamSnapshot("conv_abort")).toBeNull();
    expect(manager.shouldAutoTriggerResponse("conv_abort", "msg_abort")).toBe(false);
  });

  it("blocks auto-trigger after a successful response even when the snapshot is cleared", () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    const manager = new ChatStreamManager("acme", store);

    manager.markAttemptedUserMessage("conv_1", "msg_1");
    store.clearStreamSnapshot("conv_1");

    expect(manager.shouldAutoTriggerResponse("conv_1", "msg_1")).toBe(false);
  });

  it("allows auto-trigger for a new user message after a prior attempted response", () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    const manager = new ChatStreamManager("acme", store);

    manager.markAttemptedUserMessage("conv_1", "msg_1");
    store.clearStreamSnapshot("conv_1");

    expect(manager.shouldAutoTriggerResponse("conv_1", "msg_2")).toBe(true);
  });

  it("blocks auto-trigger after a failed response even when the snapshot is cleared", () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    const manager = new ChatStreamManager("acme", store);

    manager.markAttemptedUserMessage("conv_retry", "msg_retry");
    store.setStreamSnapshot("conv_retry", {
      conversationId: "conv_retry",
      responseToMessageId: "msg_retry",
      message: { id: "stream-msg_retry", role: "assistant", parts: [] },
      status: "error",
    });

    expect(manager.shouldAutoTriggerResponse("conv_retry", "msg_retry")).toBe(false);
    store.clearStreamSnapshot("conv_retry");
    expect(manager.shouldAutoTriggerResponse("conv_retry", "msg_retry")).toBe(false);
  });

  it("blocks auto-trigger while a snapshot is still tied to the user message", () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    const manager = new ChatStreamManager("acme", store);

    store.setStreamSnapshot("conv_1", {
      conversationId: "conv_1",
      responseToMessageId: "msg_1",
      message: { id: "stream-msg_1", role: "assistant", parts: [] },
      status: "complete",
    });

    expect(manager.shouldAutoTriggerResponse("conv_1", "msg_1")).toBe(false);
  });

  it("replaces a cached manager when a different store is passed", () => {
    const firstStore = new ChatDockStore();
    const secondStore = new ChatDockStore();
    const slug = `store-identity-${Date.now()}`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const first = getChatStreamManager(slug, firstStore);
    expect(getChatStreamManager(slug, firstStore)).toBe(first);

    const second = getChatStreamManager(slug, secondStore);
    expect(second).not.toBe(first);
    expect(second.isBoundToStore(secondStore)).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("replacing manager bound to a different ChatDockStore"),
    );

    disposeChatStreamManager(slug);
    warn.mockRestore();
  });
});
