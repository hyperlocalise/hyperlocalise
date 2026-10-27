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

export const customerIoConnectionPanelMessages = defineMessages({
  loadErrorDescription: {
    defaultMessage: "Unable to load the Customer.io connection right now.",
    id: "/rXj8VmbsB",
    description: "Customer.io integration row description when connection status fails to load",
  },
  connectIntro: {
    defaultMessage: "Paste a Customer.io App API key and choose the region for that workspace.",
    id: "A25a0/iNnR",
    description: "Intro text shown before a Customer.io API key is saved",
  },
  tokenSuffix: {
    defaultMessage: "Token ending in {suffix}",
    id: "EN8p7Z3+bb",
    description: "Secondary Customer.io connection detail showing the stored token suffix",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: "DkO/CnntHD",
    description: "Label for the Customer.io App API key field",
  },
  apiKeyHint: {
    defaultMessage:
      "Create an App API key in Customer.io Settings → API Credentials. It needs read/write access to campaigns, newsletters, broadcasts, and transactional messages.",
    id: "9NrFFG1rkB",
    description: "Hint describing where to create a Customer.io App API key",
  },
  apiKeyRotateHint: {
    defaultMessage: "Leave blank to keep the current key.",
    id: "DL2fLswVkH",
    description: "Hint that a connected Customer.io key can be rotated by pasting a new value",
  },
  showApiKeyAriaLabel: {
    defaultMessage: "Show API key",
    id: "/FgXiegnIL",
    description: "Aria label for revealing the Customer.io API key field",
  },
  hideApiKeyAriaLabel: {
    defaultMessage: "Hide API key",
    id: "RE8GVKKf1W",
    description: "Aria label for hiding the Customer.io API key field",
  },
  regionLabel: {
    defaultMessage: "Region",
    id: "VUK+nk/WAD",
    description: "Label for the Customer.io region picker",
  },
  regionHint: {
    defaultMessage:
      "US workspaces use api.customer.io, EU workspaces use api-eu.customer.io. The region must match the workspace that issued the key.",
    id: "yXPN/zbiRT",
    description: "Hint describing Customer.io regions",
  },
  save: {
    defaultMessage: "Save",
    id: "nZweXDCNR/",
    description: "Button to save the Customer.io API key and region",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "7Yw00ajLfm",
    description: "Button label while the Customer.io connection is being saved",
  },
  savedToast: {
    defaultMessage: "Customer.io connection saved.",
    id: "ZYJ/Beaygk",
    description: "Toast after the Customer.io API key and region are saved",
  },
  saveFailed: {
    defaultMessage: "Failed to save the Customer.io connection.",
    id: "+c3P6iYr+E",
    description: "Error when the Customer.io connection cannot be saved",
  },
  loadFailed: {
    defaultMessage: "Failed to load the Customer.io region.",
    id: "XtlIQmhVDA",
    description: "Error when the Customer.io region cannot be loaded",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "5AgGRDWIl/",
    description: "Button label to disconnect Customer.io",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "OscDGYHTPM",
    description: "Disconnect button label while Customer.io is being disconnected",
  },
  disconnectedToast: {
    defaultMessage: "Customer.io disconnected.",
    id: "uT4xUx84dP",
    description: "Toast after Customer.io is disconnected",
  },
  disconnectFailed: {
    defaultMessage: "Failed to disconnect Customer.io.",
    id: "I7X9+B7tkF",
    description: "Toast when Customer.io disconnect fails",
  },
});
