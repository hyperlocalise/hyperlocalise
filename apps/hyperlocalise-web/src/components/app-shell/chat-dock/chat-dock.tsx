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

export const ChatDock = observer(function ChatDock({
  organizationSlug,
  currentUser,
  planFooterHeightPx = 40,
}: {
  organizationSlug: string;
  currentUser: InboxCurrentUser;
  planFooterHeightPx?: number;
}) {
  const intl = useIntl();
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

  // Best-effort reconnect: tabs marked streaming after hydrate get a message refetch;
  // live SSE cannot resume, so clear the streaming flag once messages are available again.
  useEffect(() => {
    if (!chatDock.hydrated) {
      return;
    }

    for (const tab of chatDock.tabs) {
      if (!tab.isStreaming || tab.isPending) {
        continue;
      }

      // Keep the restored snapshot visible; mark as complete so UI does not spin forever.
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

  if (!organizationSlug) {
    return null;
  }

  const bottomOffset = planFooterHeightPx;

  if (!chatDock.hasTabs) {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-end px-3"
        style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom))` }}
      >
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="pointer-events-auto mb-1 h-8 gap-1.5 shadow-sm"
          aria-label={intl.formatMessage(chatDockMessages.newChat)}
          onClick={() => chatDock.openNewTab()}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" />
          {intl.formatMessage(chatDockMessages.newChat)}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 z-40 flex flex-col"
      style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom))` }}
    >
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
