"use client";

import { observer } from "mobx-react-lite";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { chatDockMessages } from "./chat-dock.messages";
import type { ChatDockTab } from "./chat-dock-store";

export const ChatDockTabBar = observer(function ChatDockTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: {
  tabs: ChatDockTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}) {
  const intl = useIntl();

  return (
    <div
      className="flex min-w-0 max-w-md items-center gap-1"
      role="tablist"
      aria-label="Chat conversations"
    >
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const selected = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={cn(
                "group flex max-w-40 shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs",
                selected
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                onClick={() => onSelectTab(tab.id)}
              >
                {tab.isStreaming ? (
                  <span
                    className="size-1.5 shrink-0 animate-pulse rounded-full bg-grove-500"
                    aria-label={intl.formatMessage(chatDockMessages.streaming)}
                  />
                ) : null}
                <span className="truncate">{tab.title}</span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-5 opacity-70 group-hover:opacity-100"
                aria-label={intl.formatMessage(chatDockMessages.closeTab)}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0"
        aria-label={intl.formatMessage(chatDockMessages.newChat)}
        onClick={onNewTab}
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" />
      </Button>
    </div>
  );
});
