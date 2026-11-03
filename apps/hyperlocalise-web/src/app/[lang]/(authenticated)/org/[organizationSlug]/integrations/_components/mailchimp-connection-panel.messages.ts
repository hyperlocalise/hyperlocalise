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

export const mailchimpConnectionPanelMessages = defineMessages({
  loadErrorDescription: {
    defaultMessage: "Unable to load the Mailchimp connection right now.",
    id: "EIzyJsuyBD",
    description: "Mailchimp integration row description when connection status fails to load",
  },
  authorizeUrlFailedToast: {
    defaultMessage: "Could not start Mailchimp authorization.",
    id: "g2K+bD6CxQ",
    description: "Toast when Mailchimp OAuth URL request fails",
  },
  popupBlockedToast: {
    defaultMessage: "Allow pop-ups to connect Mailchimp.",
    id: "zyVutWQ0it",
    description: "Toast when the Mailchimp OAuth window is blocked",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "m2hcMIjCyS",
    description: "Disconnect Mailchimp",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "sfV9GS+qiL",
    description: "Disconnect Mailchimp in progress",
  },
  disconnectedToast: {
    defaultMessage: "Mailchimp disconnected.",
    id: "NmW6XEmB83",
    description: "Toast when Mailchimp disconnect succeeds",
  },
  disconnectFailed: {
    defaultMessage: "Could not disconnect Mailchimp.",
    id: "q15/6hsAKH",
    description: "Toast when Mailchimp disconnect fails",
  },
});
