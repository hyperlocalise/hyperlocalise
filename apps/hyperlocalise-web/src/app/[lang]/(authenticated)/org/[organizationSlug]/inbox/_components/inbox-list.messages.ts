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
});
