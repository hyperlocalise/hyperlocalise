"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl } from "react-intl";

import type { InboxCurrentUser } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/inbox/_components/inbox-types";
import { Button } from "@/components/ui/button";
import { useAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import {
  disposeChatStreamManager,
  getChatStreamManager,
} from "@/components/app-shell/chat-dock/chat-stream-manager";

import { chatDockMessages } from "./chat-dock.messages";
import { ChatDockPanel } from "./chat-dock-panel";
import { ChatDockTabBar } from "./chat-dock-tab-bar";

/** Footer-embedded chat dock: panel + tabs (no fixed positioning of its own). */
export const ChatDock = observer(function ChatDock({
  organizationSlug,
  currentUser,
}: {
  organizationSlug: string;
  currentUser: InboxCurrentUser;
}) {
  const store = useAppShellStore();
  const { chatDock } = store;

  useEffect(() => {
    if (!organizationSlug) {
      return;
    }

    const previousSlug = chatDock.organizationSlug;
    if (previousSlug && previousSlug !== organizationSlug) {
      disposeChatStreamManager(previousSlug);
    }

    chatDock.setOrganizationSlug(organizationSlug);
    getChatStreamManager(organizationSlug, chatDock);
  }, [chatDock, organizationSlug]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-shell-dock-height", `${chatDock.chromeHeightPx}px`);
    return () => {
      root.style.setProperty("--app-shell-dock-height", "0px");
    };
  }, [chatDock.chromeHeightPx]);

  // Best-effort reconnect after hydrate: keep restored snapshot, clear spinning state.
  useEffect(() => {
    if (!chatDock.hydrated) {
      return;
    }

    for (const tab of chatDock.tabs) {
      if (!tab.isStreaming || tab.isPending) {
        continue;
      }

      if (tab.streamSnapshot) {
        chatDock.setStreamSnapshot(tab.id, {
          ...tab.streamSnapshot,
          status:
            tab.streamSnapshot.status === "streaming" ? "complete" : tab.streamSnapshot.status,
        });
      } else {
        chatDock.markStreaming(tab.id, false);
      }
    }
  }, [chatDock, chatDock.hydrated]);

  if (!organizationSlug || !chatDock.hasTabs) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-col">
      {chatDock.panelOpen ? (
        <ChatDockPanel
          organizationSlug={organizationSlug}
          currentUser={currentUser}
          store={chatDock}
        />
      ) : null}
      <ChatDockTabBar
        tabs={chatDock.tabs}
        activeTabId={chatDock.activeTabId}
        onSelectTab={(tabId) => chatDock.selectTab(tabId)}
        onCloseTab={(tabId) => {
          const manager = getChatStreamManager(organizationSlug, chatDock);
          manager.stop(tabId);
          chatDock.closeTab(tabId);
        }}
        onNewTab={() => chatDock.openNewTab()}
      />
    </div>
  );
});

/** Compact New chat control for the footer status row when no tabs are open. */
export const ChatDockNewChatButton = observer(function ChatDockNewChatButton({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const intl = useIntl();
  const store = useAppShellStore();
  const { chatDock } = store;

  useEffect(() => {
    if (!organizationSlug) {
      return;
    }

    chatDock.setOrganizationSlug(organizationSlug);
  }, [chatDock, organizationSlug]);

  if (!organizationSlug || chatDock.hasTabs) {
    return null;
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 gap-1.5 px-2 text-xs"
      aria-label={intl.formatMessage(chatDockMessages.newChat)}
      onClick={() => chatDock.openNewTab()}
    >
      <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" />
      {intl.formatMessage(chatDockMessages.newChat)}
    </Button>
  );
});
