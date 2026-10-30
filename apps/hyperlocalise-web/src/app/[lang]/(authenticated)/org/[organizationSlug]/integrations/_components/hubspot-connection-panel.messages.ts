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

export const hubspotConnectionPanelMessages = defineMessages({
  loadErrorDescription: {
    defaultMessage: "Unable to load the HubSpot connection right now.",
    id: "9mI5GoWd3Q",
    description: "HubSpot integration row description when connection status fails to load",
  },
  authorizeUrlFailedToast: {
    defaultMessage: "Could not start HubSpot authorization.",
    id: "tKEC9A/nAh",
    description: "Toast when HubSpot OAuth URL request fails",
  },
  popupBlockedToast: {
    defaultMessage: "Allow pop-ups to connect HubSpot.",
    id: "JIhKGhe8Ry",
    description: "Toast when the HubSpot OAuth window is blocked",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "oRrUQMuqOA",
    description: "Disconnect HubSpot",
  },
  disconnecting: {
    defaultMessage: "Disconnecting",
    id: "nx0R7JXLot",
    description: "Shown while HubSpot is disconnecting",
  },
  disconnectedToast: {
    defaultMessage: "HubSpot disconnected",
    id: "CBJCcle41q",
    description: "Toast after HubSpot is disconnected",
  },
  disconnectFailed: {
    defaultMessage: "Could not disconnect HubSpot",
    id: "hqDIbv77j2",
    description: "Toast when disconnecting HubSpot fails",
  },
});
