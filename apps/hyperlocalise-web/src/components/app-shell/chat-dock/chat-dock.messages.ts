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
    id: "l2MbFKxoMr",
    defaultMessage: "Ask about strings, context, progress, or translations",
    description: "Empty state subtitle describing chat capabilities",
  },
  suggestionFindContext: {
    id: "vHurxfGj2i",
    defaultMessage: "Find context for a string",
    description: "Suggested prompt chip to find localisation context",
  },
  suggestionRecentChanges: {
    id: "EChSkkf+KW",
    defaultMessage: "What changed recently",
    description: "Suggested prompt chip for recent localisation changes",
  },
  suggestionProgress: {
    id: "QpIX9JaUhS",
    defaultMessage: "Check localisation progress",
    description: "Suggested prompt chip for TMS localisation progress",
  },
  suggestionTranslate: {
    id: "C1FbXuFTUH",
    defaultMessage: "Start a translation",
    description: "Suggested prompt chip to start a translation",
  },
  promptFindContext: {
    id: "VKjWHU/QDH",
    defaultMessage: "What does this string mean, and where is it used?",
    description: "Prefilled prompt when choosing the find-context chip",
  },
  promptRecentChanges: {
    id: "N83FNjAdU2",
    defaultMessage: "What localisation strings changed recently?",
    description: "Prefilled prompt when choosing the recent-changes chip",
  },
  promptProgress: {
    id: "W8paQ6RjZy",
    defaultMessage: "How is localisation progress looking across linked TMS projects?",
    description: "Prefilled prompt when choosing the progress chip",
  },
  promptTranslate: {
    id: "homymlbTZo",
    defaultMessage: "Translate the following text:",
    description: "Prefilled prompt when choosing the translate chip",
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
