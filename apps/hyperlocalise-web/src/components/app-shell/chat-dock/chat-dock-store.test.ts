import { describe, expect, it } from "vite-plus/test";

import { CHAT_DOCK_MAX_CONCURRENT_STREAMS } from "./chat-dock-persistence";
import { ChatDockStore } from "./chat-dock-store";

function createMemoryStorage() {
  const data: Record<string, string> = {};
  return {
    getItem(key: string) {
      return data[key] ?? null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
}

describe("ChatDockStore", () => {
  it("opens, selects, and closes tabs", () => {
    const store = new ChatDockStore(createMemoryStorage());
    store.setOrganizationSlug("acme");

    const pendingId = store.openNewTab();
    expect(store.tabs).toHaveLength(1);
    expect(store.activeTabId).toBe(pendingId);
    expect(store.panelOpen).toBe(true);

    store.openTab({ id: "conv_1", title: "Checkout" });
    expect(store.tabs).toHaveLength(2);
    expect(store.activeTabId).toBe("conv_1");

    store.selectTab("conv_1");
    expect(store.panelOpen).toBe(false);

    store.closeTab(pendingId);
    expect(store.tabs.map((tab) => tab.id)).toEqual(["conv_1"]);

    store.closeTab("conv_1");
    expect(store.hasTabs).toBe(false);
    expect(store.panelOpen).toBe(false);
  });

  it("persists and hydrates org-scoped state", () => {
    const storage = createMemoryStorage();
    const store = new ChatDockStore(storage);
    store.setOrganizationSlug("acme");
    const pendingId = store.openNewTab();
    store.setDraft(pendingId, "Translate this");
    store.promotePendingTab(pendingId, "conv_99", "Translate this");

    const restored = new ChatDockStore(storage);
    restored.setOrganizationSlug("acme");
    expect(restored.tabs).toHaveLength(1);
    expect(restored.tabs[0]?.id).toBe("conv_99");
    expect(restored.tabs[0]?.title).toBe("Translate this");
    expect(restored.activeTabId).toBe("conv_99");
    expect(restored.panelOpen).toBe(true);
  });

  it("tracks concurrent stream capacity", () => {
    const store = new ChatDockStore(createMemoryStorage());
    store.setOrganizationSlug("acme");

    for (let index = 0; index < CHAT_DOCK_MAX_CONCURRENT_STREAMS; index += 1) {
      store.openTab({ id: `conv_${index}`, title: `Chat ${index}` });
      store.setStreamSnapshot(`conv_${index}`, {
        conversationId: `conv_${index}`,
        responseToMessageId: `msg_${index}`,
        message: { id: `stream-msg_${index}`, role: "assistant", parts: [] },
        status: "streaming",
      });
    }

    expect(store.streamingCount).toBe(CHAT_DOCK_MAX_CONCURRENT_STREAMS);
    expect(store.canStartStream).toBe(false);
  });

  it("stores stream snapshots without a dock tab and mirrors when opened", () => {
    const store = new ChatDockStore(createMemoryStorage());
    store.setOrganizationSlug("acme");

    store.setStreamSnapshot("conv_1", {
      conversationId: "conv_1",
      responseToMessageId: "msg_1",
      message: { id: "stream-msg_1", role: "assistant", parts: [] },
      status: "streaming",
    });
    expect(store.hasTabs).toBe(false);
    expect(store.getStreamSnapshot("conv_1")?.status).toBe("streaming");
    expect(store.streamingCount).toBe(1);

    store.openTab({ id: "conv_1", title: "Chat" });
    expect(store.tabs[0]?.isStreaming).toBe(true);
    expect(store.tabs[0]?.streamSnapshot?.responseToMessageId).toBe("msg_1");

    store.clearStreamSnapshot("conv_1");
    expect(store.getStreamSnapshot("conv_1")).toBeNull();
    expect(store.tabs[0]?.streamSnapshot).toBeNull();
    expect(store.tabs[0]?.isStreaming).toBe(false);
  });

  it("stores stream snapshots and clears them", () => {
    const store = new ChatDockStore(createMemoryStorage());
    store.setOrganizationSlug("acme");
    store.openTab({ id: "conv_1", title: "Chat" });

    store.setStreamSnapshot("conv_1", {
      conversationId: "conv_1",
      responseToMessageId: "msg_1",
      message: { id: "stream-msg_1", role: "assistant", parts: [] },
      status: "streaming",
    });
    expect(store.tabs[0]?.isStreaming).toBe(true);
    expect(store.getStreamSnapshot("conv_1")?.status).toBe("streaming");

    store.clearStreamSnapshot("conv_1");
    expect(store.tabs[0]?.streamSnapshot).toBeNull();
    expect(store.tabs[0]?.isStreaming).toBe(false);
    expect(store.getStreamSnapshot("conv_1")).toBeNull();
  });

  it("tracks ephemeral page context without persisting it", () => {
    const storage = createMemoryStorage();
    const store = new ChatDockStore(storage);
    store.setOrganizationSlug("acme");
    store.openNewTab();
    store.setPageContext({
      kind: "cat-segment",
      segmentId: "seg-02",
      key: "checkout.submit",
      sourceText: "Submit order",
    });

    expect(store.pageContext).toMatchObject({
      kind: "cat-segment",
      key: "checkout.submit",
    });

    const restored = new ChatDockStore(storage);
    restored.setOrganizationSlug("acme");
    expect(restored.pageContext).toBeNull();

    store.clearPageContext();
    expect(store.pageContext).toBeNull();
  });
});
