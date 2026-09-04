"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { memo, useMemo } from "react";
import { Chat01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyMuted, TypographySmall } from "@/components/ui/typography";
import { stripMarkdown } from "@/lib/markdown/strip-markdown";
import { cn } from "@/lib/primitives/cn";

import { inboxListMessages } from "./inbox-list.messages";
import type { InboxIssueNotification } from "./inbox-notifications-api";
import { inboxNotificationsMessages } from "./inbox-notifications.messages";
import {
  formatRelativeTime,
  getConversationParticipantAvatar,
  getSourceLabel,
  type Conversation,
  type InboxCurrentUser,
} from "./inbox-types";

export type InboxIndexItem =
  | { kind: "conversation"; conversation: Conversation; sortAt: string }
  | { kind: "notification"; notification: InboxIssueNotification; sortAt: string };

export type InboxSelection =
  | { kind: "conversation"; id: string }
  | { kind: "notification"; id: string }
  | { kind: "new" }
  | null;

export function resolveInboxSelection(input: {
  composeNew: boolean;
  urlConversationId?: string;
  urlNotificationId?: string;
  firstConversationId?: string;
  firstNotificationId?: string;
}): InboxSelection {
  if (input.composeNew) {
    return { kind: "new" };
  }
  if (input.urlNotificationId) {
    return { kind: "notification", id: input.urlNotificationId };
  }
  if (input.urlConversationId) {
    return { kind: "conversation", id: input.urlConversationId };
  }
  if (input.firstConversationId) {
    return { kind: "conversation", id: input.firstConversationId };
  }
  if (input.firstNotificationId) {
    return { kind: "notification", id: input.firstNotificationId };
  }
  return null;
}

/** Plain-text secondary line for notification rows (strips mention markdown etc.). */
export function notificationSecondaryText(excerpt: string | undefined, fallback: string): string {
  const source = excerpt?.trim() || fallback;
  return stripMarkdown(source) || source;
}

export function buildInboxIndexItems(
  conversations: Conversation[],
  notifications: InboxIssueNotification[],
): InboxIndexItem[] {
  const items: InboxIndexItem[] = [
    ...conversations.map((conversation) => ({
      kind: "conversation" as const,
      conversation,
      sortAt: conversation.lastMessageAt || conversation.createdAt,
    })),
    ...notifications.map((notification) => ({
      kind: "notification" as const,
      notification,
      sortAt: notification.createdAt,
    })),
  ];

  return items.toSorted((left, right) => {
    const byTime = right.sortAt.localeCompare(left.sortAt);
    if (byTime !== 0) {
      return byTime;
    }
    const leftId = left.kind === "conversation" ? left.conversation.id : left.notification.id;
    const rightId = right.kind === "conversation" ? right.conversation.id : right.notification.id;
    return rightId.localeCompare(leftId);
  });
}

function notificationPreviewMessage(type: InboxIssueNotification["type"]): MessageDescriptor {
  switch (type) {
    case "assigned":
      return inboxNotificationsMessages.assigned;
    case "mentioned":
      return inboxNotificationsMessages.mentioned;
    case "comment":
      return inboxNotificationsMessages.comment;
    case "status_changed":
      return inboxNotificationsMessages.statusChanged;
    case "assignee_changed":
      return inboxNotificationsMessages.assigneeChanged;
    default:
      return inboxNotificationsMessages.comment;
  }
}

export const InboxList = memo(function InboxList({
  conversations,
  currentUser,
  hasMoreNotifications,
  isError,
  isLoading,
  isLoadingMoreNotifications,
  notifications,
  onLoadMoreNotifications,
  onMarkAllRead,
  onSelectConversation,
  onSelectNotification,
  selection,
  unreadNotificationCount,
}: {
  conversations: Conversation[];
  currentUser: InboxCurrentUser;
  hasMoreNotifications: boolean;
  isError: boolean;
  isLoading: boolean;
  isLoadingMoreNotifications: boolean;
  notifications: InboxIssueNotification[];
  onLoadMoreNotifications: () => void;
  onMarkAllRead?: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSelectNotification: (notificationId: string) => void;
  selection: InboxSelection;
  unreadNotificationCount: number;
}) {
  const items = useMemo(
    () => buildInboxIndexItems(conversations, notifications),
    [conversations, notifications],
  );

  const isComposingNew = selection?.kind === "new";

  return (
    <section className="flex max-h-[40svh] min-h-0 shrink-0 flex-col overflow-hidden border-border lg:h-full lg:max-h-none lg:shrink lg:border-r">
      {unreadNotificationCount > 0 && onMarkAllRead ? (
        <div className="flex shrink-0 items-center justify-end border-b border-border px-2 py-1.5">
          <Button type="button" variant="ghost" size="xs" onClick={onMarkAllRead}>
            <FormattedMessage {...inboxNotificationsMessages.markAllRead} />
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <ConversationListSkeleton />
        ) : isError ? (
          <TypographyMuted className="px-3 py-4">
            <FormattedMessage {...inboxNotificationsMessages.loadError} />
          </TypographyMuted>
        ) : items.length === 0 && !isComposingNew ? (
          <TypographyMuted className="px-3 py-4">
            <FormattedMessage {...inboxNotificationsMessages.empty} />
          </TypographyMuted>
        ) : (
          <div className="flex flex-col gap-1">
            {isComposingNew ? <NewRequestListItem /> : null}
            {items.map((item) =>
              item.kind === "conversation" ? (
                <ConversationListItem
                  key={`conversation:${item.conversation.id}`}
                  conversation={item.conversation}
                  currentUser={currentUser}
                  isSelected={
                    selection?.kind === "conversation" && selection.id === item.conversation.id
                  }
                  onSelect={onSelectConversation}
                />
              ) : (
                <NotificationListItem
                  key={`notification:${item.notification.id}`}
                  notification={item.notification}
                  isSelected={
                    selection?.kind === "notification" && selection.id === item.notification.id
                  }
                  onSelect={onSelectNotification}
                />
              ),
            )}
            {hasMoreNotifications ? (
              <div className="px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  disabled={isLoadingMoreNotifications}
                  onClick={onLoadMoreNotifications}
                >
                  <FormattedMessage {...inboxNotificationsMessages.loadMore} />
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
});

function listItemClassName(isSelected: boolean) {
  return cn(
    "grid w-full text-left transition-colors",
    "grid-cols-[2rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-2.5",
    isSelected
      ? "bg-accent text-foreground"
      : "text-foreground hover:bg-muted hover:text-foreground",
  );
}

const NewRequestListItem = memo(function NewRequestListItem() {
  return (
    <div aria-current="page" className={listItemClassName(true)}>
      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HugeiconsIcon icon={Chat01Icon} strokeWidth={2} className="size-4" />
      </div>
      <div className="min-w-0">
        <TypographySmall lineClamp={1}>
          <FormattedMessage {...inboxListMessages.newRequestTitle} />
        </TypographySmall>
        <TypographyMuted className="mt-1" lineClamp={1}>
          <FormattedMessage {...inboxListMessages.newRequestPreview} />
        </TypographyMuted>
      </div>
    </div>
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
  const intl = useIntl();
  const participantAvatar = getConversationParticipantAvatar(
    conversation.participantEmail,
    currentUser,
    intl,
  );
  const preview = conversation.lastMessage
    ? stripMarkdown(conversation.lastMessage.text) || conversation.lastMessage.text
    : intl.formatMessage(inboxListMessages.noMessagesYet);

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(conversation.id)}
      className={listItemClassName(isSelected)}
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
          <TypographySmall lineClamp={1}>{conversation.title}</TypographySmall>
        </div>
        <TypographyMuted className="mt-1" lineClamp={1}>
          {preview}
        </TypographyMuted>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{getSourceLabel(conversation.source, intl)}</span>
          <span className="size-1 rounded-full bg-muted" />
          <span>{formatRelativeTime(conversation.lastMessageAt, intl)}</span>
        </div>
      </div>
    </button>
  );
});

const NotificationListItem = memo(function NotificationListItem({
  notification,
  isSelected,
  onSelect,
}: {
  notification: InboxIssueNotification;
  isSelected: boolean;
  onSelect: (notificationId: string) => void;
}) {
  const intl = useIntl();
  const actorName =
    notification.actor?.displayName || intl.formatMessage(inboxNotificationsMessages.someone);
  const preview = intl.formatMessage(notificationPreviewMessage(notification.type), {
    actor: actorName,
    issueTitle: notification.payload.issueTitle,
  });
  const secondary = notificationSecondaryText(notification.payload.commentExcerpt, preview);
  const isUnread = !notification.readAt;
  const avatarLabel = actorName.slice(0, 1).toUpperCase() || "?";

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(notification.id)}
      className={cn(
        "grid w-full text-left transition-colors",
        "grid-cols-[2rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-2.5",
        isSelected
          ? "bg-accent text-foreground"
          : "text-foreground hover:bg-muted hover:text-foreground",
        isUnread && !isSelected && "bg-muted/40",
      )}
    >
      <Avatar className="size-8 bg-muted">
        {notification.actor?.avatarUrl ? (
          <AvatarImage src={notification.actor.avatarUrl} alt={actorName} />
        ) : null}
        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
          {avatarLabel}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <TypographySmall lineClamp={1} weight="bold">
            {notification.payload.issueTitle}
          </TypographySmall>
          {isUnread ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
        </div>
        <TypographyMuted className="mt-1" lineClamp={1}>
          {secondary}
        </TypographyMuted>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            <FormattedMessage {...inboxNotificationsMessages.issueNotification} />
          </span>
          <span className="size-1 rounded-full bg-muted" />
          <span>{formatRelativeTime(notification.createdAt, intl)}</span>
        </div>
      </div>
    </button>
  );
});
