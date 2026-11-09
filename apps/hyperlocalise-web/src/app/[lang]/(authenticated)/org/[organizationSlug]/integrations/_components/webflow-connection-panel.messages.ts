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

export const webflowConnectionPanelMessages = defineMessages({
  fetchConnectionsFailed: {
    id: "ma412fpUlF",
    defaultMessage: "Could not load Webflow connections.",
    description: "Error toast when loading Webflow connections fails.",
  },
  saveFailed: {
    id: "LbbsOcva1p",
    defaultMessage: "Could not save the Webflow connection.",
    description: "Error toast when saving the Webflow connection fails.",
  },
  saveLimitReached: {
    id: "UkPonG/OHc",
    defaultMessage:
      "Integration limit reached for your current plan. Remove an unused integration or upgrade, then try again.",
    description:
      "Error toast when saving the Webflow connection fails because the workspace integration limit is reached.",
  },
  saveSuccess: {
    id: "Xsoxk/Vr1O",
    defaultMessage: "Webflow connection saved.",
    description: "Success toast when the Webflow connection is saved.",
  },
  deleteFailed: {
    id: "jxHawvN/1R",
    defaultMessage: "Could not remove the Webflow connection.",
    description: "Error toast when removing the Webflow connection fails.",
  },
  deleteSuccess: {
    id: "Oam8wqCN9r",
    defaultMessage: "Webflow connection removed.",
    description: "Success toast when the Webflow connection is removed.",
  },
  discoverFailed: {
    id: "Lcf15eG/dh",
    defaultMessage: "Could not discover Webflow sites for this token.",
    description: "Error toast when Webflow site discovery fails.",
  },
  displayNameLabel: {
    id: "RL75YfYQnw",
    defaultMessage: "Display name",
    description: "Label for the Webflow connection display name field.",
  },
  siteTokenLabel: {
    id: "euFZGdCjO7",
    defaultMessage: "Site API token",
    description: "Label for the Webflow site API token field.",
  },
  siteTokenDescription: {
    id: "G2B8B5FmrH",
    defaultMessage:
      "Create a site token in Webflow (Site settings → Apps & integrations → API access) with sites:read and cms:read. Add cms:write and components:read for push writeback.",
    description: "Help text explaining which Webflow API scopes the site token needs.",
  },
  siteLabel: {
    id: "MPyG43fCju",
    defaultMessage: "Site",
    description: "Label for the Webflow site picker.",
  },
  collectionsLabel: {
    id: "iR67ESPjLG",
    defaultMessage: "Collections",
    description: "Label for the Webflow collections multi-select.",
  },
  saveConnection: {
    id: "0ffRz2AzJV",
    defaultMessage: "Save connection",
    description: "Button that saves the Webflow connection.",
  },
  disconnect: {
    id: "nYssE5uByl",
    defaultMessage: "Disconnect",
    description: "Button that removes the Webflow connection.",
  },
  testDiscover: {
    id: "oYHNmKX1YV",
    defaultMessage: "Test token",
    description: "Button that validates the site token and discovers Webflow sites.",
  },
});
