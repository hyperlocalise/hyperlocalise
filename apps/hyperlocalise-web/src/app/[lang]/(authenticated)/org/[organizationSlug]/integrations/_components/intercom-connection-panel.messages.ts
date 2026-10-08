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
  connectedStatusWithToken: {
    defaultMessage: "Connected · token ending in {suffix}",
    id: "XaT7Gr5zku",
    description: "Status title when an Intercom connection has a stored token suffix",
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
