"use client";

import { FilterMailIcon, PreferenceHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { formatRelativeTime, sourceLabel, type Conversation } from "./inbox-types";

export function InboxList({
  conversations,
  isError,
  isLoading,
  onSelectConversation,
  selectedConversationId,
}: {
  conversations: Conversation[];
  isError: boolean;
  isLoading: boolean;
  onSelectConversation: (conversationId: string) => void;
  selectedConversationId: string;
}) {
  const activeCount = conversations.filter(
    (conversation) => conversation.status === "active",
  ).length;

  return (
    <section className="flex min-h-136 flex-col border-border lg:border-r">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {conversations.length === 1
                ? "1 conversation"
                : `${conversations.length} conversations`}
            </p>
            <p className="text-xs text-muted-foreground">
              {activeCount === 1 ? "1 active" : `${activeCount} active`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Filter inbox"
          >
            <HugeiconsIcon icon={FilterMailIcon} strokeWidth={1.8} className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Inbox display settings"
          >
            <HugeiconsIcon icon={PreferenceHorizontalIcon} strokeWidth={1.8} className="size-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <ConversationListSkeleton />
        ) : isError ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Unable to load conversations.</p>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isSelected={conversation.id === selectedConversationId}
                onSelect={() => onSelectConversation(conversation.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ConversationListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex gap-3 rounded-lg px-3 py-3">
          <Skeleton className="size-10 shrink-0 rounded-full bg-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4 bg-muted" />
            <Skeleton className="h-3 w-1/2 bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConversationListItem({
  conversation,
  isSelected,
  onSelect,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={cn(
        "grid w-full text-left transition-colors",
        "grid-cols-[2rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-2.5",
        isSelected
          ? "bg-accent text-foreground"
          : "text-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Avatar className="bg-muted size-8">
        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
          {sourceLabel[conversation.source]?.[0] ?? "?"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium">{conversation.title}</p>
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {conversation.lastMessage?.text ?? "No messages yet"}
        </p>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {sourceLabel[conversation.source] ?? conversation.source}
          </span>
          <span className="size-1 rounded-full bg-muted-foreground/20" />
          <span>{formatRelativeTime(conversation.lastMessageAt)}</span>
        </div>
      </div>
    </button>
  );
}
