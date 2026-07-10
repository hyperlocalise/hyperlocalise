"use client";

import { defineMessages } from "react-intl";

export const inboxPanelErrorBoundaryMessages = defineMessages({
  listTitle: {
    defaultMessage: "Conversation list failed to load",
    id: "1ggu9Tm0ub",
    description: "Error boundary title when the inbox list panel crashes",
  },
  messagesTitle: {
    defaultMessage: "Messages failed to load",
    id: "hMQhlW9yb7",
    description: "Error boundary title when the inbox messages panel crashes",
  },
  detailsTitle: {
    defaultMessage: "Conversation details failed to load",
    id: "yYnhoQZl4b",
    description: "Error boundary title when the inbox details panel crashes",
  },
  composerTitle: {
    defaultMessage: "Reply composer failed to load",
    id: "OROpfMaGFB",
    description: "Error boundary title when the inbox reply composer crashes",
  },
  description: {
    defaultMessage:
      "Something went wrong in this panel. You can retry or keep working in the other panels.",
    id: "TIsb5WlP88",
    description: "Error boundary description when an inbox panel crashes",
  },
  retry: {
    defaultMessage: "Try again",
    id: "cbNqGo9VKV",
    description: "Button label to retry rendering a crashed inbox panel",
  },
});
