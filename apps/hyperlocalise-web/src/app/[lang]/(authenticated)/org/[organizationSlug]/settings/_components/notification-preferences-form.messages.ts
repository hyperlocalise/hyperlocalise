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

export const notificationPreferencesFormMessages = defineMessages({
  sectionTitle: {
    defaultMessage: "Notifications",
    id: "ThGy8XF2yq",
    description: "Section heading for notification preferences on account settings",
  },
  sectionDescription: {
    defaultMessage: "Choose whether Issue Sheet Inbox updates are also delivered to your email.",
    id: "kzAQTYATA+",
    description: "Helper text under notification preferences on account settings",
  },
  emailEnabledLabel: {
    defaultMessage: "Email notifications",
    id: "0uQydL2hST",
    description: "Label for enabling Issue Sheet email notifications",
  },
  emailEnabledDescription: {
    defaultMessage: "Send email for unread Inbox notifications on issues you subscribe to.",
    id: "E2gAmHwHN8",
    description: "Description for enabling Issue Sheet email notifications",
  },
  emailFormatLabel: {
    defaultMessage: "Email format",
    id: "DYLD1YkZo6",
    description: "Label for email digest vs immediate delivery format",
  },
  emailFormatDescription: {
    defaultMessage:
      "Digests wait a few minutes and skip items you already read in Inbox. Immediate sends each notification right away.",
    id: "oojEYpvA6e",
    description: "Description for email digest vs immediate delivery format",
  },
  formatDigest: {
    defaultMessage: "Digest",
    id: "dYzwXx2D9X",
    description: "Email format option for batched digests",
  },
  formatImmediate: {
    defaultMessage: "Immediate",
    id: "1SIj6NW9T+",
    description: "Email format option for immediate delivery",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "/WfsxTCk+E",
    description: "Status text while notification preferences are saving",
  },
  saveError: {
    defaultMessage: "Could not save notification preferences.",
    id: "WTS9c0ZlMB",
    description: "Toast when notification preferences fail to save",
  },
  loadError: {
    defaultMessage: "Could not load notification preferences.",
    id: "THoRXiMHfa",
    description: "Error when notification preferences fail to load",
  },
});
