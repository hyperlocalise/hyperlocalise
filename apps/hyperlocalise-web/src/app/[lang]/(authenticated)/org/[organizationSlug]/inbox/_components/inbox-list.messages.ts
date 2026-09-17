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
import { defineMessages } from "react-intl";

export const inboxListMessages = defineMessages({
  loadError: {
    defaultMessage: "Unable to load conversations.",
    id: "O3w0wyu0VQ",
    description: "Error message when the inbox conversation list fails to load",
  },
  empty: {
    defaultMessage: "No conversations yet.",
    id: "Dcqju+Z+Wb",
    description: "Empty state when the organization has no inbox conversations",
  },
  noMessagesYet: {
    defaultMessage: "No messages yet",
    id: "k9uRw1QXC6",
    description: "Preview text when a conversation in the inbox list has no messages",
  },
  newRequestTitle: {
    defaultMessage: "New Request",
    id: "sHACVcApZT",
    description: "Inbox list row title for a dedicated new localisation request chat",
  },
  newRequestPreview: {
    defaultMessage: "Start a localisation request",
    id: "Leoig5Z0u9",
    description: "Inbox list row preview for a dedicated new localisation request chat",
  },
  filterReadAria: {
    defaultMessage: "Filter by read state",
    id: "fsmYjMN/9O",
    description: "Accessible label for the inbox read-state filter group",
  },
  filterReadAll: {
    defaultMessage: "All",
    id: "m9OT0Oi2mc",
    description: "Inbox filter that shows read and unread items",
  },
  filterReadUnread: {
    defaultMessage: "Unread",
    id: "m7sC7R0rtG",
    description: "Inbox filter that shows unread notifications",
  },
  filterReadRead: {
    defaultMessage: "Read",
    id: "tI6FJ9DXvD",
    description: "Inbox filter that shows read notifications and conversations",
  },
  filterTypeAria: {
    defaultMessage: "Filter by type",
    id: "XosmLLsDOK",
    description: "Accessible label for the inbox type filter menu",
  },
  filterTypeAll: {
    defaultMessage: "All types",
    id: "N8oWpgtVSh",
    description: "Inbox type filter that shows conversations and notifications",
  },
  filterTypeConversations: {
    defaultMessage: "Conversations",
    id: "XXNo1BDzd9",
    description: "Inbox type filter that shows every conversation source",
  },
  filterTypeNotifications: {
    defaultMessage: "Notifications",
    id: "g75t7EocMr",
    description: "Inbox type filter that shows every issue notification",
  },
  filterTypeGroupConversations: {
    defaultMessage: "Conversations",
    id: "XxZFsAWbq3",
    description: "Group label for conversation sources in the inbox type filter",
  },
  filterTypeGroupNotifications: {
    defaultMessage: "Notifications",
    id: "ocGV6u6MPq",
    description: "Group label for notification types in the inbox type filter",
  },
  filterEmpty: {
    defaultMessage: "No inbox items match these filters.",
    id: "7+t227O8ET",
    description: "Empty state when inbox filters hide every loaded item",
  },
  clearFilters: {
    defaultMessage: "Clear filters",
    id: "s5bizftpco",
    description: "Button that resets inbox read and type filters",
  },
});
