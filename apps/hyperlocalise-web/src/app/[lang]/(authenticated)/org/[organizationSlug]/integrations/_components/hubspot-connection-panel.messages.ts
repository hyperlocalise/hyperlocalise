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
  connectIntro: {
    defaultMessage: "Paste a HubSpot private-app access token to connect.",
    id: "PpHaNaY+BU",
    description: "Intro text shown before a HubSpot access token is saved",
  },
  tokenSuffix: {
    defaultMessage: "Token ending in {suffix}",
    id: "B/8rUjOtWy",
    description: "Secondary HubSpot connection detail showing the stored token suffix",
  },
  apiKeyLabel: {
    defaultMessage: "Access token",
    id: "0RmdfCp/CN",
    description: "Label for the HubSpot private-app access token field",
  },
  apiKeyHint: {
    defaultMessage:
      "Create a private app with the content and forms scopes, then paste its access token.",
    id: "AuJXCtnhjs",
    description: "Hint for creating a HubSpot private app before connecting",
  },
  apiKeyRotateHint: {
    defaultMessage: "Paste a new access token to replace the saved one.",
    id: "nUTl30Eq9t",
    description: "Hint shown when replacing a saved HubSpot access token",
  },
  showApiKeyAriaLabel: {
    defaultMessage: "Show access token",
    id: "DmbcvHMMp6",
    description: "Accessible label for revealing the HubSpot access token",
  },
  hideApiKeyAriaLabel: {
    defaultMessage: "Hide access token",
    id: "NdH6gnevkW",
    description: "Accessible label for hiding the HubSpot access token",
  },
  save: {
    defaultMessage: "Save",
    id: "9t4H29R3uc",
    description: "Save the HubSpot access token",
  },
  saving: {
    defaultMessage: "Saving",
    id: "rhvSi//hSX",
    description: "Shown while the HubSpot access token is saving",
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
  savedToast: {
    defaultMessage: "HubSpot connected",
    id: "Vn1d/pMrDN",
    description: "Toast after a HubSpot access token is saved",
  },
  disconnectedToast: {
    defaultMessage: "HubSpot disconnected",
    id: "CBJCcle41q",
    description: "Toast after HubSpot is disconnected",
  },
  saveFailed: {
    defaultMessage: "Could not save HubSpot",
    id: "Nwdavggy8l",
    description: "Toast when saving the HubSpot access token fails",
  },
  disconnectFailed: {
    defaultMessage: "Could not disconnect HubSpot",
    id: "hqDIbv77j2",
    description: "Toast when disconnecting HubSpot fails",
  },
});
