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

export const sanityConnectionPanelMessages = defineMessages({
  authorizeUrlFailedToast: {
    defaultMessage: "Could not start Sanity authorization.",
    id: "/Fi6xT6jqV",
    description: "Toast when Sanity Pipes authorize URL fails",
  },
  disconnectFailed: {
    defaultMessage: "Could not disconnect Sanity.",
    id: "78e/wES0A+",
    description: "Toast when Sanity disconnect fails",
  },
  disconnectedToast: {
    defaultMessage: "Sanity disconnected.",
    id: "uvMAUaKYI0",
    description: "Toast after Sanity disconnect succeeds",
  },
  loadErrorDescription: {
    defaultMessage: "Could not load Sanity connection status.",
    id: "azYeK5p8pM",
    description: "Integration row description when status query fails",
  },
  connectedStatus: {
    defaultMessage: "Connected",
    id: "Obrc0xXXmw",
    description: "Heading when Sanity is connected",
  },
  tokenSuffix: {
    defaultMessage: "Token ending in {suffix}",
    id: "dU3FCBwd7f",
    description: "Shows last four characters of connected token",
  },
  connectedDescription: {
    defaultMessage:
      "Automations with the Translate Sanity documents skill use this connection to read and write drafts.",
    id: "mDQhaViqkQ",
    description: "Body copy for connected Sanity panel",
  },
  projectsLabel: {
    defaultMessage: "Manage API projects visible to this token",
    id: "MWDDRmwK/N",
    description: "Label above project list",
  },
  noProjects: {
    defaultMessage: "No projects returned for this token.",
    id: "cI9DCPgYRt",
    description: "Empty state when project list is empty",
  },
  openAutomations: {
    defaultMessage: "Open automations",
    id: "cwHz/23Qd9",
    description: "Link to automations list",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "5HqlbunlrW",
    description: "Disconnect Sanity button",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "2N6/VNF+/O",
    description: "Disconnect in progress",
  },
});
