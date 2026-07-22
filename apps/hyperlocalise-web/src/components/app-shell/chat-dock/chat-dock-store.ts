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
import { makeAutoObservable, observable } from "mobx";
import type { UIMessage } from "ai";

import {
  CHAT_DOCK_MAX_CONCURRENT_STREAMS,
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

/** Ephemeral page-scoped context for suggestion pills. Not persisted. */
export type ChatDockPageContext = {
  kind: "cat-segment";
  segmentId: string;
  key: string;
  sourceText: string;
  contextLabel?: string;
  sourcePath?: string;
};

const STREAM_ERROR_MESSAGE = "Sorry, I encountered an error while generating a response.";

/** Mirror a live stream snapshot onto tab fields, including error banner state. */
function applyStreamSnapshotToTab(tab: ChatDockTab, snapshot: ChatDockStreamSnapshot | null) {
  tab.streamSnapshot = snapshot;
  tab.isStreaming = snapshot?.status === "streaming";
  if (snapshot?.status === "error") {
    tab.lastError = STREAM_ERROR_MESSAGE;
  } else if (snapshot?.status === "complete") {
    tab.lastError = null;
  }
}

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
  pageContext: ChatDockPageContext | null = null;
  /**
   * Live stream snapshots keyed by conversation id. Ephemeral — not persisted.
   * Dock tabs mirror these when open; inbox reads them without creating tabs.
   */
  streamsByConversationId: Record<string, ChatDockStreamSnapshot> = {};

  private storage: ChatDockStorage | undefined;
  private persistEnabled = true;

  constructor(storage?: ChatDockStorage) {
    this.storage = storage;
    makeAutoObservable(
      this,
      {
        tabs: observable.shallow,
        pageContext: observable.ref,
        streamsByConversationId: observable.ref,
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
    return Object.values(this.streamsByConversationId).filter(
      (snapshot) => snapshot.status === "streaming",
    ).length;
  }

  get canStartStream() {
    return this.streamingCount < CHAT_DOCK_MAX_CONCURRENT_STREAMS;
  }

  getStreamSnapshot(conversationId: string): ChatDockStreamSnapshot | null {
    return this.streamsByConversationId[conversationId] ?? null;
  }

  get tabBarVisible() {
    return this.hasTabs;
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
    this.streamsByConversationId = {};
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
      this.mirrorStreamToTab(existing.id);
      this.persist();
      return existing.id;
    }

    const liveStream = this.getStreamSnapshot(input.id);
    const tab: ChatDockTab = {
      id: input.id,
      title: input.title?.trim() || "Chat",
      draft: "",
      isPending: false,
      isStreaming: false,
      streamSnapshot: null,
      lastError: null,
    };
    applyStreamSnapshotToTab(tab, liveStream);

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

  setPageContext(context: ChatDockPageContext | null) {
    this.pageContext = context;
  }

  clearPageContext() {
    this.pageContext = null;
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

  setStreamSnapshot(conversationId: string, snapshot: ChatDockStreamSnapshot | null) {
    if (snapshot) {
      this.streamsByConversationId = {
        ...this.streamsByConversationId,
        [conversationId]: snapshot,
      };
    } else {
      this.removeConversationStream(conversationId);
    }

    this.updateTab(conversationId, (tab) => {
      applyStreamSnapshotToTab(tab, snapshot);
    });
  }

  /**
   * Marks an existing snapshot as streaming or complete.
   * Prefer `setStreamSnapshot` to start a stream — `markStreaming(true)` is a no-op when no snapshot exists.
   */
  markStreaming(conversationId: string, isStreaming: boolean) {
    const current = this.getStreamSnapshot(conversationId);
    if (!isStreaming && current?.status === "streaming") {
      this.streamsByConversationId = {
        ...this.streamsByConversationId,
        [conversationId]: {
          ...current,
          status: "complete",
        },
      };
    } else if (isStreaming && current) {
      this.streamsByConversationId = {
        ...this.streamsByConversationId,
        [conversationId]: {
          ...current,
          status: "streaming",
        },
      };
    }

    this.updateTab(conversationId, (tab) => {
      tab.isStreaming = isStreaming;
      if (!isStreaming && tab.streamSnapshot?.status === "streaming") {
        tab.streamSnapshot = {
          ...tab.streamSnapshot,
          status: "complete",
        };
      }
    });
  }

  clearStreamSnapshot(conversationId: string) {
    this.removeConversationStream(conversationId);
    this.updateTab(conversationId, (tab) => {
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

  private removeConversationStream(conversationId: string) {
    if (!(conversationId in this.streamsByConversationId)) {
      return;
    }

    const { [conversationId]: _removed, ...rest } = this.streamsByConversationId;
    this.streamsByConversationId = rest;
  }

  private mirrorStreamToTab(tabId: string) {
    const liveStream = this.getStreamSnapshot(tabId);
    this.updateTab(tabId, (tab) => {
      applyStreamSnapshotToTab(tab, liveStream);
    });
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
