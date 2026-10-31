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

export const iterableConnectionPanelMessages = defineMessages({
  loadErrorDescription: {
    defaultMessage: "Unable to load the Iterable connection right now.",
    id: "eZe13VGOpp",
    description: "Iterable integration row description when connection status fails to load",
  },
  connectIntro: {
    defaultMessage: "Paste a Iterable App API key and choose the region for that workspace.",
    id: "i3FfM8zpHG",
    description: "Intro text shown before a Iterable API key is saved",
  },
  tokenSuffix: {
    defaultMessage: "Token ending in {suffix}",
    id: "Tja6Ch0Bu3",
    description: "Secondary Iterable connection detail showing the stored token suffix",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: "syGH2Yunun",
    description: "Label for the Iterable App API key field",
  },
  apiKeyHint: {
    defaultMessage:
      "Create an App API key in Iterable Settings → API Credentials. It needs read/write access to campaigns, newsletters, broadcasts, and transactional messages.",
    id: "fAAVYLUFbG",
    description: "Hint describing where to create a Iterable App API key",
  },
  apiKeyRotateHint: {
    defaultMessage: "Leave blank to keep the current key.",
    id: "ljGD1pKDpL",
    description: "Hint that a connected Iterable key can be rotated by pasting a new value",
  },
  showApiKeyAriaLabel: {
    defaultMessage: "Show API key",
    id: "sGJVdftrAn",
    description: "Aria label for revealing the Iterable API key field",
  },
  hideApiKeyAriaLabel: {
    defaultMessage: "Hide API key",
    id: "DNiUebuhkV",
    description: "Aria label for hiding the Iterable API key field",
  },
  regionLabel: {
    defaultMessage: "Region",
    id: "vq7dKGB5o3",
    description: "Label for the Iterable region picker",
  },
  regionHint: {
    defaultMessage:
      "US workspaces use api.customer.io, EU workspaces use api-eu.customer.io. The region must match the workspace that issued the key.",
    id: "47LR6Yvx6z",
    description: "Hint describing Iterable regions",
  },
  save: {
    defaultMessage: "Save",
    id: "NE8upo2g24",
    description: "Button to save the Iterable API key and region",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "rkO4qLi0GG",
    description: "Button label while the Iterable connection is being saved",
  },
  savedToast: {
    defaultMessage: "Iterable connection saved.",
    id: "VyFYd54o21",
    description: "Toast after the Iterable API key and region are saved",
  },
  saveFailed: {
    defaultMessage: "Failed to save the Iterable connection.",
    id: "Ry2r5dDh9I",
    description: "Error when the Iterable connection cannot be saved",
  },
  loadFailed: {
    defaultMessage: "Failed to load the Iterable region.",
    id: "hkJpZEzllE",
    description: "Error when the Iterable region cannot be loaded",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "l23fz5UzVF",
    description: "Button label to disconnect Iterable",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "wxpoZbENp1",
    description: "Disconnect button label while Iterable is being disconnected",
  },
  disconnectedToast: {
    defaultMessage: "Iterable disconnected.",
    id: "A6HUkdtfW1",
    description: "Toast after Iterable is disconnected",
  },
  disconnectFailed: {
    defaultMessage: "Failed to disconnect Iterable.",
    id: "udSN+qqsfw",
    description: "Toast when Iterable disconnect fails",
  },
});
