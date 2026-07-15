import { describe, expect, it, vi } from "vite-plus/test";

import { CHAT_DOCK_MAX_CONCURRENT_STREAMS } from "./chat-dock-persistence";
import { ChatDockStore } from "./chat-dock-store";
import {
  ChatStreamManager,
  disposeChatStreamManager,
  getChatStreamManager,
} from "./chat-stream-manager";

const sendMessagesMock = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => {
  const mod = await importOriginal<typeof import("ai")>();
  return {
    ...mod,
    DefaultChatTransport: class {
      sendMessages(...args: unknown[]) {
        return sendMessagesMock(...args);
      }
    },
  };
});

describe("ChatStreamManager", () => {
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

    consoleError.mockRestore();
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
