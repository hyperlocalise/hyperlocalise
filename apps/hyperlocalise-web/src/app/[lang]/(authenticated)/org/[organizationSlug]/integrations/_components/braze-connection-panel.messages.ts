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

export const brazeConnectionPanelMessages = defineMessages({
  loadErrorDescription: {
    defaultMessage: "Unable to load the Braze connection right now.",
    id: "rJ/bOBdZ+R",
    description: "Braze integration row description when connection status fails to load",
  },
  connectIntro: {
    defaultMessage: "Paste a Braze REST API key and choose the REST cluster for that instance.",
    id: "qQRYeCWT2J",
    description: "Intro text shown before a Braze API key is saved",
  },
  tokenSuffix: {
    defaultMessage: "Token ending in {suffix}",
    id: "hIBcZdGd0e",
    description: "Secondary Braze connection detail showing the stored token suffix",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: "usfuALDVe8",
    description: "Label for the Braze REST API key field",
  },
  apiKeyHint: {
    defaultMessage:
      "Create a REST API key in Braze Settings → APIs and Identifiers. The key needs campaigns, Canvas, Content Blocks, email, and templates.",
    id: "PJb5ZQPovA",
    description: "Hint describing where to create a Braze REST API key and required permissions",
  },
  apiKeyRotateHint: {
    defaultMessage: "Leave blank to keep the current key.",
    id: "U4ehpvU/9G",
    description: "Hint that a connected Braze key can be rotated by pasting a new value",
  },
  showApiKeyAriaLabel: {
    defaultMessage: "Show API key",
    id: "jzpUQUqMZp",
    description: "Aria label for revealing the Braze REST API key field",
  },
  hideApiKeyAriaLabel: {
    defaultMessage: "Hide API key",
    id: "M++zkzakx8",
    description: "Aria label for hiding the Braze REST API key field",
  },
  clusterLabel: {
    defaultMessage: "REST cluster",
    id: "IyYEob9ejo",
    description: "Label for the Braze REST cluster picker",
  },
  clusterPlaceholder: {
    defaultMessage: "Choose a REST cluster",
    id: "+1MdqtQjmp",
    description: "Placeholder on the Braze REST cluster picker before a cluster is chosen",
  },
  clusterSearchPlaceholder: {
    defaultMessage: "Search or paste a REST endpoint",
    id: "+ag6bbxEOO",
    description: "Search field placeholder for filtering Braze REST clusters by key or URL",
  },
  clusterEmpty: {
    defaultMessage: "No REST cluster matches.",
    id: "rjsQdrxRfX",
    description: "Empty state when the Braze REST cluster search has no matches",
  },
  clusterHint: {
    defaultMessage:
      "Copy the REST endpoint from Braze Settings → APIs and Identifiers, then search or paste it here.",
    id: "WoFnpvLrkf",
    description:
      "Hint describing where to find the Braze REST cluster and that the URL can be pasted",
  },
  save: {
    defaultMessage: "Save",
    id: "J5c/CjjG4+",
    description: "Button to save the Braze API key and REST cluster",
  },
  saving: {
    defaultMessage: "Saving…",
    id: "eqPSkXPnrW",
    description: "Button label while the Braze connection is being saved",
  },
  savedToast: {
    defaultMessage: "Braze connection saved.",
    id: "bQ5ORexI9e",
    description: "Toast after the Braze API key and REST cluster are saved",
  },
  saveFailed: {
    defaultMessage: "Failed to save the Braze connection.",
    id: "VfFxpBKOOP",
    description: "Error when the Braze connection cannot be saved",
  },
  loadFailed: {
    defaultMessage: "Failed to load the Braze REST cluster.",
    id: "hzrUUPWRn2",
    description: "Error when the Braze REST cluster cannot be loaded",
  },
  disconnect: {
    defaultMessage: "Disconnect",
    id: "typi8awoP0",
    description: "Button label to disconnect Braze",
  },
  disconnecting: {
    defaultMessage: "Disconnecting…",
    id: "N8dLBFv91a",
    description: "Disconnect button label while Braze is being disconnected",
  },
  disconnectedToast: {
    defaultMessage: "Braze disconnected.",
    id: "UhABVcjd+v",
    description: "Toast after Braze is disconnected",
  },
  disconnectFailed: {
    defaultMessage: "Failed to disconnect Braze.",
    id: "YLbt57UkC5",
    description: "Toast when Braze disconnect fails",
  },
});
