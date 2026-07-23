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

export const conversationMessages = defineMessages({
  noMessagesYet: {
    id: "RKI1ij45Ie",

    defaultMessage: "No messages yet",
    description: "Empty state title when a conversation has no messages",
  },
  startConversation: {
    id: "ZF5d+f8aEU",

    defaultMessage: "Start a conversation to see messages here",
    description: "Empty state description prompting the user to send a message",
  },
  scrollToBottomAria: {
    id: "6CddYQ5t2q",

    defaultMessage: "Scroll to bottom",
    description: "Accessible label and tooltip for scrolling to the latest message",
  },
  downloadConversationAria: {
    id: "jyL5Pnsg0T",

    defaultMessage: "Download conversation",
    description:
      "Accessible label and tooltip for the button that downloads the conversation as a file",
  },
});
