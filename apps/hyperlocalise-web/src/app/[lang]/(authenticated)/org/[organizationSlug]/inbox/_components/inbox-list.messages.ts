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
    id: "k2nQ8pLx1A",
    description: "Accessible label for the inbox read-state filter group",
  },
  filterReadAll: {
    defaultMessage: "All",
    id: "m4rT9vWc2B",
    description: "Inbox filter that shows read and unread items",
  },
  filterReadUnread: {
    defaultMessage: "Unread",
    id: "p7sU1yHd3C",
    description: "Inbox filter that shows unread notifications",
  },
  filterReadRead: {
    defaultMessage: "Read",
    id: "q8tV2zJe4D",
    description: "Inbox filter that shows read notifications and conversations",
  },
  filterTypeAria: {
    defaultMessage: "Filter by type",
    id: "r9uW3aKf5E",
    description: "Accessible label for the inbox type filter menu",
  },
  filterTypeAll: {
    defaultMessage: "All types",
    id: "s1vX4bLg6F",
    description: "Inbox type filter that shows conversations and notifications",
  },
  filterTypeConversations: {
    defaultMessage: "Conversations",
    id: "t2wY5cMh7G",
    description: "Inbox type filter that shows every conversation source",
  },
  filterTypeNotifications: {
    defaultMessage: "Notifications",
    id: "u3xZ6dNi8H",
    description: "Inbox type filter that shows every issue notification",
  },
  filterTypeGroupConversations: {
    defaultMessage: "Conversations",
    id: "v4yA7eOj9I",
    description: "Group label for conversation sources in the inbox type filter",
  },
  filterTypeGroupNotifications: {
    defaultMessage: "Notifications",
    id: "w5zB8fPk0J",
    description: "Group label for notification types in the inbox type filter",
  },
  filterEmpty: {
    defaultMessage: "No inbox items match these filters.",
    id: "x6aC9gQl1K",
    description: "Empty state when inbox filters hide every loaded item",
  },
  clearFilters: {
    defaultMessage: "Clear filters",
    id: "y7bD0hRm2L",
    description: "Button that resets inbox read and type filters",
  },
});
