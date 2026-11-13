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
  stoppedMarker: {
    defaultMessage: "Stopped",
    id: "/0sICDrWh/",
    description: "Marker under an assistant reply that the user stopped before it finished",
  },
  clarificationOptions: {
    defaultMessage: "Suggested answers",
    id: "3Sg0Zcpu/H",
    description: "Accessible label for the buttons that answer the assistant's question",
  },
  showFullOutput: {
    defaultMessage: "Show full result",
    id: "YFMn72O3t0",
    description: "Button that loads the full tool result when the chat shows a shortened copy",
  },
  loadingFullOutput: {
    defaultMessage: "Loading full result…",
    id: "uBd8YwvQLl",
    description: "Button label while the full tool result loads",
  },
  fullOutputFailed: {
    defaultMessage: "Couldn't load the full result. Try again.",
    id: "kWOuILjyCI",
    description: "Error shown when loading the full tool result fails",
  },
});
