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

export const intercomConnectionPanelMessages = defineMessages({
  loadErrorDescription: {
    defaultMessage: "Unable to load the Intercom connection right now.",
    id: "odqLHGre3m",
    description: "Intercom integration row description when connection status fails to load",
  },
  connectedStatus: {
    defaultMessage: "Connected",
    id: "SALsrEbsZU",
    description: "Status title shown in the Intercom manage panel when connected",
  },
  connectedDescription: {
    defaultMessage:
      "Import Help Center articles into a native project, then push approved translations back as Intercom drafts.",
    id: "kQ3mV8nRp1",
    description: "Explanation of what a connected Intercom workspace can do",
  },
  tokenSuffix: {
    defaultMessage: "Token ending in {suffix}",
    id: "bH5cW2sLa7",
    description: "Secondary Intercom connection detail showing the stored token suffix",
  },
  regionLabel: {
    defaultMessage: "Region · {region}",
    id: "dN9fT4xUe2",
    description: "Intercom REST region shown in the connected manage panel",
  },
  helpCentersLabel: {
    defaultMessage: "Help Centers",
    id: "gP6yR1jKc8",
    description: "Heading above Help Centers on the connected Intercom panel",
  },
  noHelpCenters: {
    defaultMessage: "No Help Centers were found on this workspace.",
    id: "mS2aL7vQd4",
    description: "Empty state when a connected Intercom workspace has no Help Centers",
  },
  openAutomations: {
    defaultMessage: "Open automations",
    id: "wE8hN5pTb0",
    description: "Link from the Intercom connection panel to workspace automations",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "vAl33la+cf",
    description: "Button label to disconnect Intercom",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "AW2iTpnW/h",
    description: "Disconnect button label while Intercom is being disconnected",
  },
  authorizeUrlFailedToast: {
    defaultMessage: "Failed to start the Intercom connection.",
    id: "POgqFuVLk+",
    description: "Toast when the Intercom WorkOS authorize URL cannot be created",
  },
  disconnectedToast: {
    defaultMessage: "Intercom disconnected.",
    id: "X4e5FCrkXH",
    description: "Toast after Intercom is disconnected",
  },
  disconnectFailed: {
    defaultMessage: "Failed to disconnect Intercom.",
    id: "LewgKQxaFX",
    description: "Toast when Intercom disconnect fails",
  },
});
