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

export const sanityStudioPluginConnectionPanelMessages = defineMessages({
  rowName: {
    defaultMessage: "Sanity Studio plugin",
    id: "BUlLAYC2D/",
    description: "Integrations row title for the Sanity Studio Hyperlocalise plugin",
  },
  rowDescription: {
    defaultMessage: "OAuth connections for the Hyperlocalise document inspector in Sanity Studio.",
    id: "Ut8l1LdDPW",
    description: "Integrations row description for the Sanity Studio plugin",
  },
  fetchFailed: {
    defaultMessage: "Unable to load Studio plugin connections.",
    id: "laYnV29ZSq",
    description: "Error when Studio plugin connections fail to load",
  },
  saveFailed: {
    defaultMessage: "Unable to save the connection.",
    id: "bVMruRpKiP",
    description: "Error when saving a Studio plugin connection fails",
  },
  saveSucceeded: {
    defaultMessage: "Studio plugin connection saved.",
    id: "elAWDDUN6Q",
    description: "Toast when a Studio plugin connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Unable to remove the connection.",
    id: "8FuO/BC/c+",
    description: "Error when deleting a Studio plugin connection fails",
  },
  deleteSucceeded: {
    defaultMessage: "Studio plugin connection removed.",
    id: "lwgvZ9xUis",
    description: "Toast when a Studio plugin connection is removed",
  },
  displayNameRequired: {
    defaultMessage: "Enter a display name.",
    id: "Cb+/mJmwXa",
    description: "Validation when Studio plugin connection display name is empty",
  },
  apiKeyRequired: {
    defaultMessage: "Select an API key.",
    id: "iSlJS2Ett8",
    description: "Validation when Studio plugin connection API key is missing",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "vHYlPb35Wz",
    description: "Label for Studio plugin connection display name field",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: "ELEQOeEjfE",
    description: "Label for Studio plugin connection API key field",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "o+eSDrg1s2",
    description: "Button to add a Studio plugin connection",
  },
  enabled: {
    defaultMessage: "Enabled",
    id: "tC4GUVUAOj",
    description: "Badge when a Studio plugin connection is enabled",
  },
  oauthHint: {
    defaultMessage:
      "Editors connect from the Hyperlocalise inspector in Studio via OAuth. Each grant is bound to that Studio origin.",
    id: "phnvkhj1NZ",
    description: "Help text explaining Studio plugin OAuth",
  },
});
