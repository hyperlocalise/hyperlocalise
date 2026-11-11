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

export const replyComposerMessages = defineMessages({
  untitledFile: {
    defaultMessage: "untitled",
    id: "irvEuLEEdu",
    description: "Fallback filename when an attached file has no name",
  },
  streamingPlaceholder: {
    defaultMessage: "Agent is responding…",
    id: "NiuLdrxXFj",
    description: "Reply composer placeholder while the agent is streaming a response",
  },
  defaultPlaceholder: {
    defaultMessage: "Ask Hyperlocalise…",
    id: "QsCILqwet/",
    description: "Default placeholder for the inbox reply composer textarea",
  },
  addAttachments: {
    defaultMessage: "Add photos and files",
    id: "27Ij3QBoyk",
    description: "Accessible label and tooltip for attaching files in the reply composer",
  },
  sendReply: {
    defaultMessage: "Send reply",
    id: "GgnHOabvof",
    description: "Accessible label and tooltip for sending a reply in the inbox composer",
  },
  send: {
    defaultMessage: "Send",
    id: "UFI0ojyOjH",
    description: "Visible label on the inbox reply composer send button",
  },
  stop: {
    defaultMessage: "Stop",
    id: "04h7kjzN4y",
    description: "Label on the reply composer button that stops the agent's current answer",
  },
  stopping: {
    defaultMessage: "Stopping…",
    id: "mRI1HyUzI9",
    description: "Label on the reply composer stop button after the user pressed it",
  },
  queuePlaceholder: {
    defaultMessage: "Add a follow-up. It sends when the agent finishes.",
    id: "PuVmZm+KxX",
    description: "Reply composer placeholder while the agent is answering; new messages are queued",
  },
  queuedHeading: {
    defaultMessage: "Queued",
    id: "FTeElrtllX",
    description: "Small heading above messages waiting to be sent after the agent's current answer",
  },
  queuedFiles: {
    defaultMessage: "{count, plural, one {# file} other {# files}}",
    id: "derlJG1uK2",
    description: "Number of files attached to a queued message",
  },
  editQueued: {
    defaultMessage: "Edit queued message",
    id: "kXjW7h0fXA",
    description: "Accessible label for moving a queued message back into the composer to edit it",
  },
  removeQueued: {
    defaultMessage: "Remove queued message",
    id: "RD6TNTYdhG",
    description: "Accessible label for removing a message from the queue",
  },
});
