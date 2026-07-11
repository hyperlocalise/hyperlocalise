"use client";

import { defineMessages } from "react-intl";

export const chatDockMessages = defineMessages({
  newChat: {
    id: "mV0v+ofKFK",
    defaultMessage: "New request",
    description: "Button to open a new chat dock tab",
  },
  closeTab: {
    id: "1fxDZQx14T",
    defaultMessage: "Close chat",
    description: "Accessible label for closing a chat dock tab",
  },
  collapsePanel: {
    id: "yZhpu31YiJ",
    defaultMessage: "Collapse chat",
    description: "Accessible label for collapsing the chat dock panel",
  },
  expandPanel: {
    id: "GmObeT3Tn1",
    defaultMessage: "Expand chat",
    description: "Accessible label for expanding the chat dock panel",
  },
  openInInbox: {
    id: "vVbXCgpKIh",
    defaultMessage: "Open in Inbox",
    description: "Link from chat dock to the full inbox page",
  },
  emptyComposer: {
    id: "V9yUZUb6UP",
    defaultMessage: "Ask Hyperlocalise to translate or localise…",
    description: "Placeholder for a new chat dock composer",
  },
  streaming: {
    id: "pXpP8bdMfG",
    defaultMessage: "Generating response",
    description: "Accessible label for a streaming chat tab indicator",
  },
  maxStreams: {
    id: "/Q3+a6FMED",
    defaultMessage: "You can run up to {count} chats at once.",
    description: "Toast when the concurrent stream limit is reached",
  },
  createFailed: {
    id: "C0+hlj1Es4",
    defaultMessage: "Could not start this chat. Try again.",
    description: "Error when creating a conversation from the chat dock fails",
  },
  sendFailed: {
    id: "ZeUNHM/VrO",
    defaultMessage: "Could not send your message. Try again.",
    description: "Error when sending a chat dock reply fails",
  },
  conversationMissing: {
    id: "d8Vs3k3UER",
    defaultMessage: "This conversation is no longer available.",
    description: "Toast when a docked conversation returns 404",
  },
});
