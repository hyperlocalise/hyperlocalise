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
    id: "NuylnhUe8K",
    defaultMessage: "Ask Hyperlocalise…",
    description: "Placeholder for a new chat dock composer",
  },
  emptyTitle: {
    id: "wUNlUdJpD/",
    defaultMessage: "Welcome to Hyperlocalise",
    description: "Empty state title for a new chat dock conversation",
  },
  emptySubtitle: {
    id: "w2b0cdIV3S",
    defaultMessage: "Ask about strings, context, or anything else",
    description: "Empty state subtitle describing chat capabilities",
  },
  suggestionFindContext: {
    id: "pehDkakH9A",
    defaultMessage: "What's the context of a string",
    description: "Suggested prompt chip to find localisation context",
  },
  suggestionSegmentContext: {
    id: "01h5d0m29X",
    defaultMessage: "Context of {source}",
    description: "Suggested prompt chip for the currently selected CAT segment source string",
  },
  promptFindContext: {
    id: "FLl4UNTozx",
    defaultMessage: "What's the context of",
    description:
      "Prefilled prompt stem when choosing the find-context chip without a selected string",
  },
  promptSegmentContext: {
    id: "ERiH8D9Q+l",
    defaultMessage: 'What\'s the context of "{source}"?',
    description:
      "Prefilled prompt when asking for context of the selected CAT segment source string",
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
  panelErrorTitle: {
    id: "trM5T+lG0s",
    defaultMessage: "Chat could not be displayed",
    description: "Title shown when the chat dock panel fails to render",
  },
  panelErrorDescription: {
    id: "K99IJACIpb",
    defaultMessage: "The rest of your workspace is still available. Try loading this chat again.",
    description: "Description shown when the chat dock panel fails to render",
  },
  tryAgain: {
    id: "hjMbjSqPe8",
    defaultMessage: "Try again",
    description: "Button to retry rendering the chat dock panel",
  },
  closeChat: {
    id: "wANdpDUOzB",
    defaultMessage: "Close chat",
    description: "Button to collapse a failed chat dock panel",
  },
});
