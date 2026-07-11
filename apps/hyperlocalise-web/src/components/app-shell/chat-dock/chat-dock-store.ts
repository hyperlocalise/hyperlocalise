import { makeAutoObservable, observable } from "mobx";
import type { UIMessage } from "ai";

import {
  CHAT_DOCK_MAX_CONCURRENT_STREAMS,
  CHAT_DOCK_PANEL_HEIGHT_PX,
  createEmptyChatDockState,
  readChatDockState,
  writeChatDockState,
  type ChatDockStorage,
  type ChatDockStreamStatus,
  type PersistedChatDockState,
  type PersistedChatDockStreamSnapshot,
  type PersistedChatDockTab,
} from "./chat-dock-persistence";

export type ChatDockStreamSnapshot = {
  conversationId: string;
  responseToMessageId: string;
  message: UIMessage;
  status: Exclude<ChatDockStreamStatus, "idle">;
};

export type ChatDockTab = {
  id: string;
  title: string;
  draft: string;
  isPending: boolean;
  isStreaming: boolean;
  streamSnapshot: ChatDockStreamSnapshot | null;
  lastError: string | null;
};

function createPendingTabId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pending-${crypto.randomUUID()}`;
  }

  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toPersistedSnapshot(
  snapshot: ChatDockStreamSnapshot | null,
): PersistedChatDockStreamSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return {
    conversationId: snapshot.conversationId,
    responseToMessageId: snapshot.responseToMessageId,
    message: {
      id: snapshot.message.id,
      role: "assistant",
      parts: snapshot.message.parts as unknown[],
    },
    status: snapshot.status,
  };
}

function fromPersistedSnapshot(
  snapshot: PersistedChatDockStreamSnapshot | null,
): ChatDockStreamSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return {
    conversationId: snapshot.conversationId,
    responseToMessageId: snapshot.responseToMessageId,
    message: {
      id: snapshot.message.id,
      role: "assistant",
      parts: snapshot.message.parts as UIMessage["parts"],
    },
    status: snapshot.status,
  };
}

function fromPersistedTab(tab: PersistedChatDockTab): ChatDockTab {
  return {
    id: tab.id,
    title: tab.title,
    draft: tab.draft,
    isPending: tab.isPending,
    isStreaming: tab.isStreaming,
    streamSnapshot: fromPersistedSnapshot(tab.streamSnapshot),
    lastError: tab.lastError,
  };
}

export class ChatDockStore {
  organizationSlug = "";
  tabs: ChatDockTab[] = [];
  activeTabId: string | null = null;
  panelOpen = false;
  hydrated = false;

  private storage: ChatDockStorage | undefined;
  private persistEnabled = true;

  constructor(storage?: ChatDockStorage) {
    this.storage = storage;
    makeAutoObservable(
      this,
      {
        tabs: observable.shallow,
      },
      { autoBind: true },
    );
  }

  get activeTab(): ChatDockTab | null {
    return this.tabs.find((tab) => tab.id === this.activeTabId) ?? null;
  }

  get hasTabs() {
    return this.tabs.length > 0;
  }

  get streamingCount() {
    return this.tabs.filter((tab) => tab.isStreaming).length;
  }

  get canStartStream() {
    return this.streamingCount < CHAT_DOCK_MAX_CONCURRENT_STREAMS;
  }

  get tabBarVisible() {
    return this.hasTabs;
  }

  get chromeHeightPx() {
    if (!this.hasTabs || !this.panelOpen) {
      return 0;
    }

    return CHAT_DOCK_PANEL_HEIGHT_PX;
  }

  setOrganizationSlug(organizationSlug: string) {
    if (this.organizationSlug === organizationSlug && this.hydrated) {
      return;
    }

    this.organizationSlug = organizationSlug;
    this.hydrate();
  }

  hydrate() {
    const state = readChatDockState(this.organizationSlug, this.storage);
    this.applyPersistedState(state);
    this.hydrated = true;
  }

  openNewTab() {
    const id = createPendingTabId();
    const tab: ChatDockTab = {
      id,
      title: "New chat",
      draft: "",
      isPending: true,
      isStreaming: false,
      streamSnapshot: null,
      lastError: null,
    };

    this.tabs = [...this.tabs, tab];
    this.activeTabId = id;
    this.panelOpen = true;
    this.persist();
    return id;
  }

  openTab(input: { id: string; title?: string }) {
    const existing = this.tabs.find((tab) => tab.id === input.id);
    if (existing) {
      this.activeTabId = existing.id;
      this.panelOpen = true;
      this.persist();
      return existing.id;
    }

    const tab: ChatDockTab = {
      id: input.id,
      title: input.title?.trim() || "Chat",
      draft: "",
      isPending: false,
      isStreaming: false,
      streamSnapshot: null,
      lastError: null,
    };

    this.tabs = [...this.tabs, tab];
    this.activeTabId = tab.id;
    this.panelOpen = true;
    this.persist();
    return tab.id;
  }

  selectTab(tabId: string) {
    if (!this.tabs.some((tab) => tab.id === tabId)) {
      return;
    }

    if (this.activeTabId === tabId && this.panelOpen) {
      this.panelOpen = false;
      this.persist();
      return;
    }

    this.activeTabId = tabId;
    this.panelOpen = true;
    this.persist();
  }

  closeTab(tabId: string) {
    const index = this.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) {
      return;
    }

    const wasActive = this.activeTabId === tabId;
    this.tabs = this.tabs.filter((tab) => tab.id !== tabId);

    if (this.tabs.length === 0) {
      this.activeTabId = null;
      this.panelOpen = false;
      this.persist();
      return;
    }

    if (wasActive) {
      const next = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.activeTabId = next?.id ?? null;
    }

    this.persist();
  }

  setPanelOpen(open: boolean) {
    if (!this.hasTabs) {
      this.panelOpen = false;
      this.persist();
      return;
    }

    this.panelOpen = open;
    this.persist();
  }

  togglePanel() {
    this.setPanelOpen(!this.panelOpen);
  }

  setDraft(tabId: string, draft: string) {
    this.updateTab(tabId, (tab) => {
      tab.draft = draft;
    });
  }

  setTitle(tabId: string, title: string) {
    this.updateTab(tabId, (tab) => {
      tab.title = title.trim() || tab.title;
    });
  }

  setLastError(tabId: string, error: string | null) {
    this.updateTab(tabId, (tab) => {
      tab.lastError = error;
    });
  }

  promotePendingTab(pendingId: string, conversationId: string, title?: string) {
    const tab = this.tabs.find((entry) => entry.id === pendingId);
    if (!tab) {
      return;
    }

    tab.id = conversationId;
    tab.isPending = false;
    if (title?.trim()) {
      tab.title = title.trim();
    } else if (tab.title === "New chat" && tab.draft.trim()) {
      tab.title = tab.draft.trim().slice(0, 48);
    }

    if (this.activeTabId === pendingId) {
      this.activeTabId = conversationId;
    }

    this.tabs = [...this.tabs];
    this.persist();
  }

  setStreamSnapshot(tabId: string, snapshot: ChatDockStreamSnapshot | null) {
    this.updateTab(tabId, (tab) => {
      tab.streamSnapshot = snapshot;
      tab.isStreaming = snapshot?.status === "streaming";
      if (snapshot?.status === "error") {
        tab.lastError = "Sorry, I encountered an error while generating a response.";
      } else if (snapshot?.status === "complete") {
        tab.lastError = null;
      }
    });
  }

  markStreaming(tabId: string, isStreaming: boolean) {
    this.updateTab(tabId, (tab) => {
      tab.isStreaming = isStreaming;
      if (!isStreaming && tab.streamSnapshot?.status === "streaming") {
        tab.streamSnapshot = {
          ...tab.streamSnapshot,
          status: "complete",
        };
      }
    });
  }

  clearStreamSnapshot(tabId: string) {
    this.updateTab(tabId, (tab) => {
      tab.streamSnapshot = null;
      tab.isStreaming = false;
    });
  }

  toPersistedState(): PersistedChatDockState {
    return {
      version: 1,
      organizationSlug: this.organizationSlug,
      activeTabId: this.activeTabId,
      panelOpen: this.panelOpen,
      tabs: this.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        draft: tab.draft,
        isPending: tab.isPending,
        isStreaming: tab.isStreaming,
        streamSnapshot: toPersistedSnapshot(tab.streamSnapshot),
        lastError: tab.lastError,
      })),
    };
  }

  private applyPersistedState(state: PersistedChatDockState) {
    this.tabs = state.tabs.map(fromPersistedTab);
    this.activeTabId = state.activeTabId;
    this.panelOpen = state.panelOpen;
  }

  private updateTab(tabId: string, mutate: (tab: ChatDockTab) => void) {
    const tab = this.tabs.find((entry) => entry.id === tabId);
    if (!tab) {
      return;
    }

    mutate(tab);
    this.tabs = [...this.tabs];
    this.persist();
  }

  private persist() {
    if (!this.persistEnabled || !this.organizationSlug) {
      return;
    }

    writeChatDockState(this.toPersistedState(), this.storage);
  }
}

export function createChatDockStore(storage?: ChatDockStorage) {
  return new ChatDockStore(storage);
}

export function createEmptyChatDockStoreState(organizationSlug: string) {
  return createEmptyChatDockState(organizationSlug);
}
