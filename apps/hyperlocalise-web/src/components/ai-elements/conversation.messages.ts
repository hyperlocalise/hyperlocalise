"use client";

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
    id: "hwc4QU1Ip1",

    defaultMessage: "Download conversation",
    description: "Accessible label for downloading the conversation as a file",
  },
  downloadConversationTooltip: {
    id: "hK0QYAJ27z",

    defaultMessage: "Download conversation",
    description: "Tooltip for the download conversation button",
  },
});
