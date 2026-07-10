"use client";

import { memo } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyMuted, TypographySmall } from "@/components/ui/typography";
import { stripMarkdown } from "@/lib/markdown/strip-markdown";
import { cn } from "@/lib/primitives/cn";

import {
  formatRelativeTime,
  getConversationParticipantAvatar,
  sourceLabel,
  type Conversation,
  type InboxCurrentUser,
} from "./inbox-types";

// Memoized to prevent re-rendering the entire list during chat streaming
export const InboxList = memo(function InboxList({
  conversations,
  currentUser,
  isError,
  isLoading,
  onSelectConversation,
  selectedConversationId,
}: {
  conversations: Conversation[];
  currentUser: InboxCurrentUser;
  isError: boolean;
  isLoading: boolean;
  onSelectConversation: (conversationId: string) => void;
  selectedConversationId: string;
}) {
  return (
    <section className="flex max-h-[40svh] min-h-0 shrink-0 flex-col overflow-hidden border-border lg:h-full lg:max-h-none lg:shrink lg:border-r">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <ConversationListSkeleton />
        ) : isError ? (
          <TypographyMuted className="px-3 py-4">Unable to load conversations.</TypographyMuted>
        ) : conversations.length === 0 ? (
          <TypographyMuted className="px-3 py-4">No conversations yet.</TypographyMuted>
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                currentUser={currentUser}
                isSelected={conversation.id === selectedConversationId}
                onSelect={onSelectConversation}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});

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

// Memoized to prevent re-rendering every item in the list during chat streaming
const ConversationListItem = memo(function ConversationListItem({
  conversation,
  currentUser,
  isSelected,
  onSelect,
}: {
  conversation: Conversation;
  currentUser: InboxCurrentUser;
  isSelected: boolean;
  onSelect: (conversationId: string) => void;
}) {
  const participantAvatar = getConversationParticipantAvatar(
    conversation.participantEmail,
    currentUser,
  );

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "grid w-full text-left transition-colors",
        "grid-cols-[2rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-2.5",
        isSelected
          ? "bg-accent text-foreground"
          : "text-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Avatar className="size-8 bg-muted">
        {participantAvatar.imageUrl ? (
          <AvatarImage src={participantAvatar.imageUrl} alt={participantAvatar.alt} />
        ) : null}
        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
          {participantAvatar.label}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <TypographySmall className="truncate">{conversation.title}</TypographySmall>
        </div>
        <TypographyMuted className="mt-1 truncate">
          {conversation.lastMessage
            ? stripMarkdown(conversation.lastMessage.text) || "No messages yet"
            : "No messages yet"}
        </TypographyMuted>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {sourceLabel[conversation.source] ?? conversation.source}
          </span>
          <span className="size-1 rounded-full bg-muted" />
          <span>{formatRelativeTime(conversation.lastMessageAt)}</span>
        </div>
      </div>
    </button>
  );
});
