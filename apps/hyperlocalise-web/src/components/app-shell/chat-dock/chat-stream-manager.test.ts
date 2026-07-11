import { describe, expect, it } from "vite-plus/test";

import { CHAT_DOCK_MAX_CONCURRENT_STREAMS } from "./chat-dock-persistence";
import { ChatDockStore } from "./chat-dock-store";
import { ChatStreamManager } from "./chat-stream-manager";

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
      store.markStreaming(id, true);
    }

    expect(manager.activeCount).toBe(CHAT_DOCK_MAX_CONCURRENT_STREAMS);

    const result = await manager.start({
      conversationId: "d",
      responseToMessageId: "msg_d",
      text: "hello",
    });

    expect(result).toEqual({
      started: false,
      reason: `You can run up to ${CHAT_DOCK_MAX_CONCURRENT_STREAMS} chats at once.`,
    });
    expect(manager.isStreaming("d")).toBe(false);
  });

  it("stops an active stream and clears streaming state", () => {
    const store = new ChatDockStore();
    store.setOrganizationSlug("acme");
    store.openTab({ id: "conv_1", title: "Chat" });
    store.markStreaming("conv_1", true);

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
  });
});
