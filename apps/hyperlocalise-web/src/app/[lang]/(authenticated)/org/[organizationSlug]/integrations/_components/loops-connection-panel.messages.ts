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

export const loopsConnectionPanelMessages = defineMessages({
  loadErrorDescription: {
    defaultMessage: "Unable to load the Loops connection right now.",
    id: 'Db6c2KbVq+',
    description: "Loops integration row description when connection status fails to load",
  },
  connectIntro: {
    defaultMessage: "Paste a Loops API key from Settings → API to connect.",
    id: 'ihyEeCEUTL',
    description: "Intro text shown before a Loops API key is saved",
  },
  tokenSuffix: {
    defaultMessage: "Token ending in {suffix}",
    id: 'vx+yIOnd53',
    description: "Secondary Loops connection detail showing the stored token suffix",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: '/mphmqLHCF',
    description: "Label for the Loops API key field",
  },
  apiKeyHint: {
    defaultMessage: "Create an API key in Loops Settings → API. It needs email content access.",
    id: 'qnfPUkkJm3',
    description: "Hint describing where to create a Loops API key",
  },
  apiKeyRotateHint: {
    defaultMessage: "Leave blank to keep the current key.",
    id: '8WDtb95za0',
    description: "Hint that a connected Loops key can be rotated by pasting a new value",
  },
  showApiKeyAriaLabel: {
    defaultMessage: "Show API key",
    id: 'XbLeNEXbTC',
    description: "Aria label for revealing the Loops API key field",
  },
  hideApiKeyAriaLabel: {
    defaultMessage: "Hide API key",
    id: 'Ivn09arh0q',
    description: "Aria label for hiding the Loops API key field",
  },
  save: {
    defaultMessage: "Save",
    id: 'JU7dBsiFsd',
    description: "Button to save the Loops API key",
  },
  saving: {
    defaultMessage: "Saving…",
    id: 'nNoQa8f6jF',
    description: "Button label while the Loops connection is being saved",
  },
  savedToast: {
    defaultMessage: "Loops connection saved.",
    id: 'J/EEoW11/3',
    description: "Toast after the Loops API key is saved",
  },
  saveFailed: {
    defaultMessage: "Failed to save the Loops connection.",
    id: '+cpm06UYba',
    description: "Error when the Loops connection cannot be saved",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: 'TqW56kj+0X',
    description: "Button label to disconnect Loops",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: 'x5HXZEeH7B',
    description: "Disconnect button label while Loops is being disconnected",
  },
  disconnectedToast: {
    defaultMessage: "Loops disconnected.",
    id: '1YCrFEJjnL',
    description: "Toast after Loops is disconnected",
  },
  disconnectFailed: {
    defaultMessage: "Failed to disconnect Loops.",
    id: 'qVud/nlb01',
    description: "Toast when Loops disconnect fails",
  },
});
