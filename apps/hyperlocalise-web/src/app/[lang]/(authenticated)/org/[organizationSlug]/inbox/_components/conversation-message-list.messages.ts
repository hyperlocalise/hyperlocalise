"use client";

import { defineMessages } from "react-intl";

export const conversationMessageListMessages = defineMessages({
  emptyTitle: {
    defaultMessage: "No messages yet",
    id: "0UVlCvBqbT",
    description: "Empty state title when an inbox conversation has no messages",
  },
  emptyDescription: {
    defaultMessage: "Conversation messages will appear here.",
    id: "jZ//cDcZ51",
    description: "Empty state description when an inbox conversation has no messages",
  },
  workingMarker: {
    defaultMessage: "Hyperlocalise is working…",
    id: "XhZzwexSlh",
    description: "Status marker shown while the inbox assistant response is still streaming",
  },
  documentFallback: {
    defaultMessage: "Document",
    id: "/THUJejkLd",
    description: "Fallback title for a document source without a title or filename",
  },
});
