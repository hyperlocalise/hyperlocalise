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

export const aiElementErrorBoundaryMessages = defineMessages({
  messageTitle: {
    defaultMessage: "Message failed to render",
    id: "jztUpXyotb",
    description: "Error boundary title when a chat message response crashes",
  },
  toolTitle: {
    defaultMessage: "Tool call failed to render",
    id: "Ifd/sQBUjN",
    description: "Error boundary title when a tool call UI crashes",
  },
  reasoningTitle: {
    defaultMessage: "Reasoning failed to render",
    id: "D6N0QoCpN1",
    description: "Error boundary title when reasoning UI crashes",
  },
  sourcesTitle: {
    defaultMessage: "Sources failed to render",
    id: "0nNAqN4Vgj",
    description: "Error boundary title when sources UI crashes",
  },
  codeBlockTitle: {
    defaultMessage: "Code block failed to render",
    id: "AkuhSH8rwy",
    description: "Error boundary title when a code block crashes",
  },
  description: {
    defaultMessage:
      "This part of the reply hit an error. Retry it, or continue with the rest of the conversation.",
    id: "qh1KvSzeYI",
    description: "Error boundary description when an AI element crashes",
  },
  retry: {
    defaultMessage: "Try again",
    id: "ZSpIiSP+sp",
    description: "Button label to retry rendering a crashed AI element",
  },
});
