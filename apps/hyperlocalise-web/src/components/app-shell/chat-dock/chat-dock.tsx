"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
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

function messagesQueryKey(conversationId: string) {
  return ["conversation-messages", conversationId] as const;
}

function conversationsQueryKey(organizationSlug: string) {
  return ["conversations", organizationSlug] as const;
}

/** Shell-lifetime setup: hydrate, CSS height var, stream manager. Mount once in the footer. */
export const ChatDockBridge = observer(function ChatDockBridge({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const store = useAppShellStore();
  const { chatDock } = store;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!organizationSlug) {
      return;
    }

    const previousSlug = chatDock.organizationSlug;
    if (previousSlug && previousSlug !== organizationSlug) {
      disposeChatStreamManager(previousSlug);
    }

    chatDock.setOrganizationSlug(organizationSlug);
    const streamManager = getChatStreamManager(organizationSlug, chatDock);
    streamManager.setOnStreamFinished(async (conversationId) => {
      await queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId) });
      await queryClient.invalidateQueries({ queryKey: conversationsQueryKey(organizationSlug) });
      chatDock.clearStreamSnapshot(conversationId);
    });

    return () => {
      streamManager.setOnStreamFinished(null);
    };
  }, [chatDock, organizationSlug, queryClient]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-shell-dock-height", `${chatDock.chromeHeightPx}px`);
    return () => {
      root.style.setProperty("--app-shell-dock-height", "0px");
    };
  }, [chatDock.chromeHeightPx]);

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

  return null;
});

/** Expandable conversation panel above the footer status row. */
export const ChatDockPanelHost = observer(function ChatDockPanelHost({
  organizationSlug,
  currentUser,
}: {
  organizationSlug: string;
  currentUser: InboxCurrentUser;
}) {
  const { chatDock } = useAppShellStore();

  if (!organizationSlug || !chatDock.hasTabs || !chatDock.panelOpen || !chatDock.activeTab) {
    return null;
  }

  return (
    <ChatDockPanel organizationSlug={organizationSlug} currentUser={currentUser} store={chatDock} />
  );
});

/** Right-side footer controls: New chat icon, or open conversation tabs. */
export const ChatDockFooterControls = observer(function ChatDockFooterControls({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const intl = useIntl();
  const { chatDock } = useAppShellStore();

  if (!organizationSlug) {
    return null;
  }

  if (!chatDock.hasTabs) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={intl.formatMessage(chatDockMessages.newChat)}
        onClick={() => chatDock.openNewTab()}
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
      </Button>
    );
  }

  return (
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
  );
});
