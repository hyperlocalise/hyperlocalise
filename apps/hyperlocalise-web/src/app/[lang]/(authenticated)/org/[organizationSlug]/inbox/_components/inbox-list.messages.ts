"use client";

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
