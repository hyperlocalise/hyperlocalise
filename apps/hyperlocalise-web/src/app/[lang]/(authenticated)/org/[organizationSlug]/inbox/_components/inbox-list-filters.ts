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
import type { InboxIssueNotification } from "./inbox-notifications-api";
import type { Conversation } from "./inbox-types";

export const INBOX_READ_FILTERS = ["all", "unread", "read"] as const;

export type InboxReadFilter = (typeof INBOX_READ_FILTERS)[number];

export const INBOX_TYPE_FILTERS = [
  "all",
  "conversations",
  "notifications",
  "chat_ui",
  "email_agent",
  "github_agent",
  "slack_agent",
  "web_chat",
  "assigned",
  "mentioned",
  "comment",
  "status_changed",
  "assignee_changed",
] as const;

export type InboxTypeFilter = (typeof INBOX_TYPE_FILTERS)[number];

export const INBOX_CONVERSATION_TYPE_FILTERS = [
  "conversations",
  "chat_ui",
  "email_agent",
  "github_agent",
  "slack_agent",
  "web_chat",
] as const satisfies readonly InboxTypeFilter[];

export const INBOX_NOTIFICATION_TYPE_FILTERS = [
  "notifications",
  "assigned",
  "mentioned",
  "comment",
  "status_changed",
  "assignee_changed",
] as const satisfies readonly InboxTypeFilter[];

export type InboxIndexItem =
  | { kind: "conversation"; conversation: Conversation; sortAt: string }
  | { kind: "notification"; notification: InboxIssueNotification; sortAt: string };

export type InboxListFilters = {
  read: InboxReadFilter;
  type: InboxTypeFilter;
};

export const DEFAULT_INBOX_LIST_FILTERS: InboxListFilters = {
  read: "all",
  type: "all",
};

export function isInboxListFiltersActive(filters: InboxListFilters): boolean {
  return filters.read !== "all" || filters.type !== "all";
}

export function inboxItemMatchesReadFilter(item: InboxIndexItem, read: InboxReadFilter): boolean {
  if (read === "all") {
    return true;
  }
  if (item.kind === "conversation") {
    return read === "read";
  }
  const isUnread = item.notification.readAt == null;
  return read === "unread" ? isUnread : !isUnread;
}

export function inboxItemMatchesTypeFilter(item: InboxIndexItem, type: InboxTypeFilter): boolean {
  if (type === "all") {
    return true;
  }
  if (type === "conversations") {
    return item.kind === "conversation";
  }
  if (type === "notifications") {
    return item.kind === "notification";
  }
  if (item.kind === "conversation") {
    return item.conversation.source === type;
  }
  return item.notification.type === type;
}

export function filterInboxIndexItems(
  items: InboxIndexItem[],
  filters: InboxListFilters,
): InboxIndexItem[] {
  if (!isInboxListFiltersActive(filters)) {
    return items;
  }
  return items.filter(
    (item) =>
      inboxItemMatchesReadFilter(item, filters.read) &&
      inboxItemMatchesTypeFilter(item, filters.type),
  );
}
