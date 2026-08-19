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

export const webChatPageMessages = defineMessages({
  unavailableTitle: {
    defaultMessage: "This chat is paused",
    id: "wchPgPau01",
    description: "Title when a public web chat agent is paused",
  },
  unavailableDescription: {
    defaultMessage: "The creator has paused this agent. Try again later.",
    id: "wchPgPauD1",
    description: "Description when a public web chat agent is paused",
  },
  emptyState: {
    defaultMessage: "Ask a question to start chatting with {name}.",
    id: "wchPgEmp01",
    description: "Empty conversation prompt on the public web chat page",
  },
  composerPlaceholder: {
    defaultMessage: "Write a message…",
    id: "wchPgPh01",
    description: "Placeholder for the public web chat composer",
  },
  attachImage: {
    defaultMessage: "Attach image",
    id: "wchPgAtt01",
    description: "Accessible label for attaching an image in public web chat",
  },
  send: {
    defaultMessage: "Send",
    id: "wchPgSnd01",
    description: "Send button on the public web chat composer",
  },
  sending: {
    defaultMessage: "Sending…",
    id: "wchPgSng01",
    description: "Send button label while a public web chat message is in flight",
  },
  sendError: {
    defaultMessage: "Unable to send that message right now.",
    id: "wchPgErr01",
    description: "Toast when a public web chat message fails",
  },
  botBlocked: {
    defaultMessage: "Automated traffic is not allowed on this chat.",
    id: "wchPgBot01",
    description: "Toast when BotID blocks a public web chat request",
  },
  loadError: {
    defaultMessage: "Unable to load this conversation.",
    id: "wchPgLdE01",
    description: "Error when the public web chat conversation fails to load",
  },
  imageOnlyFallback: {
    defaultMessage: "Attached an image.",
    id: "wchPgImg01",
    description: "Fallback user text when only an image is sent",
  },
  visitor: {
    defaultMessage: "You",
    id: "wchPgYou01",
    description: "Label for visitor messages in public web chat",
  },
  removeImage: {
    defaultMessage: "Remove {filename}",
    id: "wchPgRmI01",
    description: "Accessible label to remove a pending image attachment",
  },
});
