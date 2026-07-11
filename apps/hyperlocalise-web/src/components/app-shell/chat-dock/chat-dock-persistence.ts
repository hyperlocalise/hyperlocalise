const CHAT_DOCK_STORAGE_VERSION = 1;
export const CHAT_DOCK_MAX_CONCURRENT_STREAMS = 3;
export const CHAT_DOCK_TAB_BAR_HEIGHT_PX = 40;
export const CHAT_DOCK_PANEL_HEIGHT_PX = 420;

export type ChatDockStreamStatus = "idle" | "streaming" | "complete" | "error";

export type PersistedChatDockStreamSnapshot = {
  conversationId: string;
  responseToMessageId: string;
  message: {
    id: string;
    role: "assistant";
    parts: unknown[];
  };
  status: Exclude<ChatDockStreamStatus, "idle">;
};

export type PersistedChatDockTab = {
  id: string;
  title: string;
  draft: string;
  isPending: boolean;
  isStreaming: boolean;
  streamSnapshot: PersistedChatDockStreamSnapshot | null;
  lastError: string | null;
};

export type PersistedChatDockState = {
  version: typeof CHAT_DOCK_STORAGE_VERSION;
  organizationSlug: string;
  activeTabId: string | null;
  panelOpen: boolean;
  tabs: PersistedChatDockTab[];
};

export type ChatDockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function chatDockStorageKey(organizationSlug: string) {
  return `chat-dock:v${CHAT_DOCK_STORAGE_VERSION}:${organizationSlug}`;
}

function getBrowserStorage(): ChatDockStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isPersistedStreamSnapshot(value: unknown): value is PersistedChatDockStreamSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<PersistedChatDockStreamSnapshot>;
  return (
    typeof snapshot.conversationId === "string" &&
    typeof snapshot.responseToMessageId === "string" &&
    Boolean(snapshot.message) &&
    typeof snapshot.message === "object" &&
    typeof snapshot.message.id === "string" &&
    snapshot.message.role === "assistant" &&
    Array.isArray(snapshot.message.parts) &&
    (snapshot.status === "streaming" ||
      snapshot.status === "complete" ||
      snapshot.status === "error")
  );
}

function isPersistedTab(value: unknown): value is PersistedChatDockTab {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tab = value as Partial<PersistedChatDockTab>;
  return (
    typeof tab.id === "string" &&
    tab.id.length > 0 &&
    typeof tab.title === "string" &&
    typeof tab.draft === "string" &&
    typeof tab.isPending === "boolean" &&
    typeof tab.isStreaming === "boolean" &&
    (tab.streamSnapshot === null || isPersistedStreamSnapshot(tab.streamSnapshot)) &&
    (tab.lastError === null || typeof tab.lastError === "string")
  );
}

export function createEmptyChatDockState(organizationSlug: string): PersistedChatDockState {
  return {
    version: CHAT_DOCK_STORAGE_VERSION,
    organizationSlug,
    activeTabId: null,
    panelOpen: false,
    tabs: [],
  };
}

export function readChatDockState(
  organizationSlug: string,
  storage: ChatDockStorage | undefined = getBrowserStorage(),
): PersistedChatDockState {
  if (!storage || !organizationSlug) {
    return createEmptyChatDockState(organizationSlug);
  }

  try {
    const raw = storage.getItem(chatDockStorageKey(organizationSlug));
    if (!raw) {
      return createEmptyChatDockState(organizationSlug);
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return createEmptyChatDockState(organizationSlug);
    }

    const state = parsed as Partial<PersistedChatDockState>;
    if (state.version !== CHAT_DOCK_STORAGE_VERSION || !Array.isArray(state.tabs)) {
      return createEmptyChatDockState(organizationSlug);
    }

    const tabs = state.tabs.filter(isPersistedTab);
    const activeTabId =
      typeof state.activeTabId === "string" && tabs.some((tab) => tab.id === state.activeTabId)
        ? state.activeTabId
        : (tabs[0]?.id ?? null);

    return {
      version: CHAT_DOCK_STORAGE_VERSION,
      organizationSlug,
      activeTabId,
      panelOpen: Boolean(state.panelOpen) && tabs.length > 0,
      tabs,
    };
  } catch {
    return createEmptyChatDockState(organizationSlug);
  }
}

export function writeChatDockState(
  state: PersistedChatDockState,
  storage: ChatDockStorage | undefined = getBrowserStorage(),
) {
  if (!storage || !state.organizationSlug) {
    return;
  }

  try {
    storage.setItem(chatDockStorageKey(state.organizationSlug), JSON.stringify(state));
  } catch {
    // Dock persistence is best-effort; private mode / quota must not break chat.
  }
}

export function clearChatDockState(
  organizationSlug: string,
  storage: ChatDockStorage | undefined = getBrowserStorage(),
) {
  if (!storage || !organizationSlug) {
    return;
  }

  try {
    storage.removeItem(chatDockStorageKey(organizationSlug));
  } catch {
    // Ignore storage failures on clear.
  }
}
