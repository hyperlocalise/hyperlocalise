import { describe, expect, it } from "vite-plus/test";

import {
  chatDockStorageKey,
  clearChatDockState,
  createEmptyChatDockState,
  readChatDockState,
  writeChatDockState,
  type ChatDockStorage,
  type PersistedChatDockState,
} from "./chat-dock-persistence";

function createMemoryStorage(initial: Record<string, string> = {}): ChatDockStorage {
  const data = { ...initial };
  return {
    getItem(key) {
      return data[key] ?? null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

describe("chat-dock-persistence", () => {
  it("round-trips a valid dock state", () => {
    const storage = createMemoryStorage();
    const state: PersistedChatDockState = {
      version: 1,
      organizationSlug: "acme",
      activeTabId: "conv_1",
      panelOpen: true,
      tabs: [
        {
          id: "conv_1",
          title: "Translate checkout",
          draft: "hello",
          isPending: false,
          isStreaming: true,
          streamSnapshot: {
            conversationId: "conv_1",
            responseToMessageId: "msg_1",
            message: { id: "stream-msg_1", role: "assistant", parts: [] },
            status: "streaming",
          },
          lastError: null,
        },
      ],
    };

    writeChatDockState(state, storage);
    expect(readChatDockState("acme", storage)).toEqual(state);
    expect(storage.getItem(chatDockStorageKey("acme"))).toBeTruthy();
  });

  it("returns empty state for corrupt or version-mismatched payloads", () => {
    const storage = createMemoryStorage({
      [chatDockStorageKey("acme")]: "{not-json",
    });
    expect(readChatDockState("acme", storage)).toEqual(createEmptyChatDockState("acme"));

    writeChatDockState(
      {
        version: 1,
        organizationSlug: "acme",
        activeTabId: null,
        panelOpen: false,
        tabs: [],
      },
      storage,
    );
    storage.setItem(
      chatDockStorageKey("acme"),
      JSON.stringify({ version: 99, tabs: [{ id: "x" }] }),
    );
    expect(readChatDockState("acme", storage)).toEqual(createEmptyChatDockState("acme"));
  });

  it("clears stored state", () => {
    const storage = createMemoryStorage();
    writeChatDockState(createEmptyChatDockState("acme"), storage);
    clearChatDockState("acme", storage);
    expect(storage.getItem(chatDockStorageKey("acme"))).toBeNull();
  });
});
