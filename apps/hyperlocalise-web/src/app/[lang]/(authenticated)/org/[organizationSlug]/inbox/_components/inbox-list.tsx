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
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Chat01Icon, FilterIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from "react-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyMuted, TypographySmall } from "@/components/ui/typography";
import { stripMarkdown } from "@/lib/markdown/strip-markdown";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import { cn } from "@/lib/primitives/cn";

import {
  getConversationListItemVisual,
  getNotificationListItemVisual,
  type InboxListItemVisual,
} from "./inbox-list-item-visuals";
import {
  DEFAULT_INBOX_LIST_FILTERS,
  filterInboxIndexItems,
  INBOX_CONVERSATION_TYPE_FILTERS,
  INBOX_NOTIFICATION_TYPE_FILTERS,
  INBOX_PRIORITY_FILTERS,
  INBOX_READ_FILTERS,
  isInboxListFiltersActive,
  type InboxIndexItem,
  type InboxListFilters,
  type InboxPriorityFilter,
  type InboxTypeFilter,
} from "./inbox-list-filters";
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

export type { InboxIndexItem };

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

export function inboxSelectionsEqual(left: InboxSelection, right: InboxSelection): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (left.kind === "new" && right.kind === "new") {
    return true;
  }
  if (left.kind === "conversation" && right.kind === "conversation") {
    return left.id === right.id;
  }
  if (left.kind === "notification" && right.kind === "notification") {
    return left.id === right.id;
  }
  return false;
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

const readFilterMessage = {
  all: inboxListMessages.filterReadAll,
  unread: inboxListMessages.filterReadUnread,
  read: inboxListMessages.filterReadRead,
} as const;

function inboxTypeFilterLabel(type: InboxTypeFilter, intl: IntlShape): string {
  switch (type) {
    case "all":
      return intl.formatMessage(inboxListMessages.filterTypeAll);
    case "conversations":
      return intl.formatMessage(inboxListMessages.filterTypeConversations);
    case "notifications":
      return intl.formatMessage(inboxListMessages.filterTypeNotifications);
    case "chat_ui":
    case "email_agent":
    case "github_agent":
    case "slack_agent":
    case "web_chat":
      return getSourceLabel(type, intl);
    case "assigned":
      return intl.formatMessage(inboxNotificationsMessages.assignedType);
    case "mentioned":
      return intl.formatMessage(inboxNotificationsMessages.mentionedType);
    case "comment":
      return intl.formatMessage(inboxNotificationsMessages.commentType);
    case "status_changed":
      return intl.formatMessage(inboxNotificationsMessages.statusChangedType);
    case "assignee_changed":
      return intl.formatMessage(inboxNotificationsMessages.assigneeChangedType);
    default:
      return assertNever(type);
  }
}

function inboxPriorityFilterLabel(priority: InboxPriorityFilter, intl: IntlShape): string {
  switch (priority) {
    case "all":
      return intl.formatMessage(inboxListMessages.filterPriorityAll);
    case "P0":
      return intl.formatMessage(inboxListMessages.filterPriorityP0);
    case "P1":
      return intl.formatMessage(inboxListMessages.filterPriorityP1);
    case "P2":
      return intl.formatMessage(inboxListMessages.filterPriorityP2);
    case "none":
      return intl.formatMessage(inboxListMessages.filterPriorityNone);
    default:
      return assertNever(priority);
  }
}

function InboxListFiltersToolbar({
  filters,
  onFiltersChange,
  onMarkAllRead,
}: {
  filters: InboxListFilters;
  onFiltersChange: (filters: InboxListFilters) => void;
  onMarkAllRead?: () => void;
}) {
  const intl = useIntl();
  const priorityActive = filters.priority !== "all";
  const typeActive = filters.type !== "all";

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label={intl.formatMessage(inboxListMessages.filterReadAria)}
          className="flex min-w-0 items-center gap-0.5"
        >
          {INBOX_READ_FILTERS.map((read) => {
            const isActive = filters.read === read;
            return (
              <Button
                key={read}
                type="button"
                variant="ghost"
                size="xs"
                aria-pressed={isActive}
                className={cn(isActive && "bg-muted text-foreground")}
                onClick={() => onFiltersChange({ ...filters, read })}
              >
                <FormattedMessage {...readFilterMessage[read]} />
              </Button>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className={cn("gap-1 font-normal", typeActive && "border-grove-400/40")}
                  aria-label={intl.formatMessage(inboxListMessages.filterTypeAria)}
                />
              }
            >
              <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-3" />
              <span className="max-w-24 truncate">{inboxTypeFilterLabel(filters.type, intl)}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuRadioGroup
                value={filters.type}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, type: value as InboxTypeFilter })
                }
              >
                <DropdownMenuRadioItem value="all">
                  <FormattedMessage {...inboxListMessages.filterTypeAll} />
                </DropdownMenuRadioItem>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <FormattedMessage {...inboxListMessages.filterTypeGroupConversations} />
                  </DropdownMenuLabel>
                  {INBOX_CONVERSATION_TYPE_FILTERS.map((type) => (
                    <DropdownMenuRadioItem key={type} value={type}>
                      {inboxTypeFilterLabel(type, intl)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <FormattedMessage {...inboxListMessages.filterTypeGroupNotifications} />
                  </DropdownMenuLabel>
                  {INBOX_NOTIFICATION_TYPE_FILTERS.map((type) => (
                    <DropdownMenuRadioItem key={type} value={type}>
                      {inboxTypeFilterLabel(type, intl)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className={cn("gap-1 font-normal", priorityActive && "border-grove-400/40")}
                  aria-label={intl.formatMessage(inboxListMessages.filterPriorityAria)}
                />
              }
            >
              <span className="max-w-20 truncate">
                {inboxPriorityFilterLabel(filters.priority, intl)}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuRadioGroup
                value={filters.priority}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, priority: value as InboxPriorityFilter })
                }
              >
                {INBOX_PRIORITY_FILTERS.map((priority) => (
                  <DropdownMenuRadioItem key={priority} value={priority}>
                    {inboxPriorityFilterLabel(priority, intl)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {onMarkAllRead ? (
        <div className="flex items-center justify-end">
          <Button type="button" variant="ghost" size="xs" onClick={onMarkAllRead}>
            <FormattedMessage {...inboxNotificationsMessages.markAllRead} />
          </Button>
        </div>
      ) : null}
    </div>
  );
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
  filters: filtersProp,
  hasMoreNotifications,
  isError,
  isLoading,
  isLoadingMoreNotifications,
  notifications,
  onFiltersChange,
  onLoadMoreNotifications,
  onMarkAllRead,
  onSelectConversation,
  onSelectNotification,
  selection,
  unreadNotificationCount,
}: {
  conversations: Conversation[];
  currentUser: InboxCurrentUser;
  filters?: InboxListFilters;
  hasMoreNotifications: boolean;
  isError: boolean;
  isLoading: boolean;
  isLoadingMoreNotifications: boolean;
  notifications: InboxIssueNotification[];
  onFiltersChange?: (filters: InboxListFilters) => void;
  onLoadMoreNotifications: () => void;
  onMarkAllRead?: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSelectNotification: (notificationId: string) => void;
  selection: InboxSelection;
  unreadNotificationCount: number;
}) {
  const [uncontrolledFilters, setUncontrolledFilters] = useState<InboxListFilters>(
    DEFAULT_INBOX_LIST_FILTERS,
  );
  const filters = filtersProp ?? uncontrolledFilters;
  const setFilters = onFiltersChange ?? setUncontrolledFilters;
  const allItems = useMemo(
    () => buildInboxIndexItems(conversations, notifications),
    [conversations, notifications],
  );
  const items = useMemo(() => filterInboxIndexItems(allItems, filters), [allItems, filters]);
  const filtersActive = isInboxListFiltersActive(filters);
  const isComposingNew = selection?.kind === "new";
  const showMarkAllRead = unreadNotificationCount > 0 && onMarkAllRead;
  const isFilteredEmpty = !isLoading && !isError && allItems.length > 0 && items.length === 0;
  const canLoadMoreFilteredPage = isFilteredEmpty && hasMoreNotifications;
  const autoLoadPageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!canLoadMoreFilteredPage || isLoadingMoreNotifications) {
      return;
    }
    const pageKey = `${filters.priority}:${filters.read}:${filters.type}:${notifications.length}`;
    if (autoLoadPageKeyRef.current === pageKey) {
      return;
    }
    autoLoadPageKeyRef.current = pageKey;
    onLoadMoreNotifications();
  }, [
    canLoadMoreFilteredPage,
    filters.read,
    filters.priority,
    filters.type,
    isLoadingMoreNotifications,
    notifications.length,
    onLoadMoreNotifications,
  ]);

  return (
    <section className="flex max-h-[40svh] min-h-0 shrink-0 flex-col overflow-hidden border-border lg:h-full lg:max-h-none lg:shrink lg:border-r">
      <InboxListFiltersToolbar
        filters={filters}
        onFiltersChange={setFilters}
        onMarkAllRead={showMarkAllRead ? onMarkAllRead : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <ConversationListSkeleton />
        ) : isError ? (
          <TypographyMuted className="px-3 py-4">
            <FormattedMessage {...inboxNotificationsMessages.loadError} />
          </TypographyMuted>
        ) : items.length === 0 && !isComposingNew ? (
          <div className="flex flex-col items-start gap-2 px-3 py-4">
            <TypographyMuted>
              <FormattedMessage
                {...(filtersActive && isFilteredEmpty
                  ? hasMoreNotifications
                    ? inboxListMessages.filterEmptyHasMore
                    : inboxListMessages.filterEmpty
                  : inboxNotificationsMessages.empty)}
              />
            </TypographyMuted>
            {filtersActive && isFilteredEmpty ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setFilters(DEFAULT_INBOX_LIST_FILTERS)}
              >
                <FormattedMessage {...inboxListMessages.clearFilters} />
              </Button>
            ) : null}
            {hasMoreNotifications ? (
              <InboxLoadMoreNotifications
                disabled={isLoadingMoreNotifications}
                onLoadMore={onLoadMoreNotifications}
              />
            ) : null}
          </div>
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
              <InboxLoadMoreNotifications
                disabled={isLoadingMoreNotifications}
                onLoadMore={onLoadMoreNotifications}
              />
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
});

function InboxLoadMoreNotifications({
  disabled,
  onLoadMore,
}: {
  disabled: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="w-full px-2 py-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full"
        disabled={disabled}
        onClick={onLoadMore}
      >
        <FormattedMessage {...inboxNotificationsMessages.loadMore} />
      </Button>
    </div>
  );
}

function listItemClassName(isSelected: boolean, isUnread = false) {
  return cn(
    "grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md px-2 py-2.5 text-left transition-colors",
    isSelected
      ? "bg-accent text-foreground"
      : "text-foreground hover:bg-muted hover:text-foreground",
    isUnread && !isSelected && "bg-muted/40",
  );
}

function InboxListItemAvatar({
  visual,
  children,
}: {
  visual: InboxListItemVisual;
  children: ReactNode;
}) {
  return (
    <div className="relative shrink-0">
      <Avatar className="bg-muted">{children}</Avatar>
      <span
        className="absolute -end-0.5 -bottom-0.5 z-10 flex size-[18px] items-center justify-center rounded-full bg-card shadow-sm ring-2 ring-background"
        aria-label={visual.typeIconLabel}
      >
        <HugeiconsIcon
          icon={visual.typeIcon}
          strokeWidth={2}
          size={12}
          className={cn("shrink-0", visual.badgeClassName)}
        />
      </span>
    </div>
  );
}

function InboxListItemContent({
  title,
  subtitle,
  timestamp,
  titleWeight = "regular",
  showMeta = true,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  timestamp: string;
  titleWeight?: "regular" | "bold";
  showMeta?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <TypographySmall lineClamp={1} weight={titleWeight === "bold" ? "bold" : undefined}>
          {title}
        </TypographySmall>
        {showMeta && timestamp ? (
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
            {timestamp}
          </span>
        ) : null}
      </div>
      <TypographyMuted className="mt-0.5" lineClamp={1}>
        {subtitle}
      </TypographyMuted>
    </div>
  );
}

const NewRequestListItem = memo(function NewRequestListItem() {
  const intl = useIntl();
  const visual: InboxListItemVisual = {
    typeIcon: SparklesIcon,
    typeIconLabel: intl.formatMessage(inboxListMessages.newRequestTitle),
    badgeClassName: "text-primary",
  };

  return (
    <div aria-current="page" className={listItemClassName(true)}>
      <InboxListItemAvatar visual={visual}>
        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
          <HugeiconsIcon icon={Chat01Icon} strokeWidth={2} className="size-4" />
        </AvatarFallback>
      </InboxListItemAvatar>
      <InboxListItemContent
        title={<FormattedMessage {...inboxListMessages.newRequestTitle} />}
        subtitle={<FormattedMessage {...inboxListMessages.newRequestPreview} />}
        timestamp=""
        titleWeight="bold"
        showMeta={false}
      />
    </div>
  );
});

function ConversationListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md px-2 py-2.5"
        >
          <Skeleton className="size-8 shrink-0 rounded-full bg-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-3/4 bg-muted" />
              <Skeleton className="h-3 w-10 bg-muted" />
            </div>
            <Skeleton className="h-3 w-full bg-muted" />
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
  const visual = getConversationListItemVisual(conversation.source, intl);

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(conversation.id)}
      className={listItemClassName(isSelected)}
    >
      <InboxListItemAvatar visual={visual}>
        {participantAvatar.imageUrl ? (
          <AvatarImage src={participantAvatar.imageUrl} alt={participantAvatar.alt} />
        ) : null}
        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
          {participantAvatar.label}
        </AvatarFallback>
      </InboxListItemAvatar>
      <InboxListItemContent
        title={conversation.title}
        subtitle={preview}
        timestamp={formatRelativeTime(conversation.lastMessageAt, intl)}
      />
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
  const visual = getNotificationListItemVisual(notification.type, intl);

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(notification.id)}
      className={listItemClassName(isSelected, isUnread)}
    >
      <InboxListItemAvatar visual={visual}>
        {notification.actor?.avatarUrl ? (
          <AvatarImage src={notification.actor.avatarUrl} alt={actorName} />
        ) : null}
        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
          {avatarLabel}
        </AvatarFallback>
      </InboxListItemAvatar>
      <InboxListItemContent
        title={notification.payload.issueTitle}
        subtitle={secondary}
        timestamp={formatRelativeTime(notification.createdAt, intl)}
        titleWeight={isUnread ? "bold" : "regular"}
      />
    </button>
  );
});
