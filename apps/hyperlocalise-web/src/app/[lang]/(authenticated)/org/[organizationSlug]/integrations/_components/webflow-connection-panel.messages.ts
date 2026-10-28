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
    id: "bNpDNvwmy6",
    defaultMessage: "Could not load Webflow connections.",
  },
  saveFailed: {
    id: "skVn2H8okl",
    defaultMessage: "Could not save the Webflow connection.",
  },
  saveSuccess: {
    id: "d9XnkTiMwa",
    defaultMessage: "Webflow connection saved.",
  },
  deleteFailed: {
    id: "IrXkRGkNg+",
    defaultMessage: "Could not remove the Webflow connection.",
  },
  deleteSuccess: {
    id: "i3W7KzynKY",
    defaultMessage: "Webflow connection removed.",
  },
  discoverFailed: {
    id: "cLv7GmUtju",
    defaultMessage: "Could not discover Webflow sites for this token.",
  },
  displayNameLabel: {
    id: "dOQCL8n7dZ",
    defaultMessage: "Display name",
  },
  siteTokenLabel: {
    id: "BZ46rNugS+",
    defaultMessage: "Site API token",
  },
  siteTokenDescription: {
    id: "K2bg1r0npM",
    defaultMessage:
      "Create a site token in Webflow (Site settings → Apps & integrations → API access) with sites:read and cms:read. Add cms:write and components:read for push writeback.",
  },
  siteLabel: {
    id: "pYwSd7GOih",
    defaultMessage: "Site",
  },
  collectionsLabel: {
    id: "ulh3kf5ajW",
    defaultMessage: "Collections",
  },
  saveConnection: {
    id: "yOSZPpjJVr",
    defaultMessage: "Save connection",
  },
  disconnect: {
    id: "qj1uhzynub",
    defaultMessage: "Disconnect",
  },
  testDiscover: {
    id: "kEIrxxLHQG",
    defaultMessage: "Test token",
  },
});
