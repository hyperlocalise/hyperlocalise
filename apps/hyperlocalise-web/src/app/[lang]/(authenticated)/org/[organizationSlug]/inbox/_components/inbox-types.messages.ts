"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const inboxTypesMessages = defineMessages({
  userFallback: {
    defaultMessage: "User",
    id: "7h7yO8hu3a",
    description: "Fallback display name when a conversation participant has no name or email",
  },
  sourceChat: {
    defaultMessage: "Chat",
    id: "pfy3DuQrRy",
    description: "Inbox conversation source label for in-app chat",
  },
  sourceEmail: {
    defaultMessage: "Email",
    id: "GZp4BhEFd0",
    description: "Inbox conversation source label for the email agent",
  },
  sourceGitHub: {
    defaultMessage: "GitHub",
    id: "DRRpzdvulu",
    description: "Inbox conversation source label for the GitHub agent",
  },
  sourceSlack: {
    defaultMessage: "Slack",
    id: "6Su/xhxJZL",
    description: "Inbox conversation source label for the Slack agent",
  },
  statusActive: {
    defaultMessage: "Active",
    id: "QNkL8EdZgQ",
    description: "Inbox conversation status badge when the conversation is active",
  },
  statusArchived: {
    defaultMessage: "Archived",
    id: "gr2zgIumPD",
    description: "Inbox conversation status badge when the conversation is archived",
  },
  relativeUnavailable: {
    defaultMessage: "n/a",
    id: "QjFaCfzbLV",
    description: "Fallback relative timestamp when a conversation date is missing or invalid",
  },
  relativeNow: {
    defaultMessage: "now",
    id: "N6O6G8ZqRN",
    description: "Relative timestamp when an inbox event happened less than a minute ago",
  },
  relativeMinutes: {
    defaultMessage: "{count}m",
    id: "QHWzXoDsKo",
    description: "Abbreviated relative timestamp in minutes for inbox list and headers",
  },
  relativeHours: {
    defaultMessage: "{count}h",
    id: "bpLn5dtiqI",
    description: "Abbreviated relative timestamp in hours for inbox list and headers",
  },
  relativeDays: {
    defaultMessage: "{count}d",
    id: "gD6NdIE0OY",
    description: "Abbreviated relative timestamp in days for inbox list and headers",
  },
});
