"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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
});
