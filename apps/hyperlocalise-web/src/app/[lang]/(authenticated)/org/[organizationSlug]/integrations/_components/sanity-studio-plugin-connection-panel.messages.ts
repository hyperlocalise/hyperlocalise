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
    id: "kQ8m2pL9xR",
    description: "Integrations row title for the Sanity Studio Hyperlocalise plugin",
  },
  rowDescription: {
    defaultMessage:
      "OAuth connections for the Hyperlocalise document inspector in Sanity Studio.",
    id: "vN3w7hJ4sT",
    description: "Integrations row description for the Sanity Studio plugin",
  },
  fetchFailed: {
    defaultMessage: "Unable to load Studio plugin connections.",
    id: "bF6c1yM8kP",
    description: "Error when Studio plugin connections fail to load",
  },
  saveFailed: {
    defaultMessage: "Unable to save the connection.",
    id: "dH9r5nW2qL",
    description: "Error when saving a Studio plugin connection fails",
  },
  saveSucceeded: {
    defaultMessage: "Studio plugin connection saved.",
    id: "gJ2t8vX6mN",
    description: "Toast when a Studio plugin connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Unable to remove the connection.",
    id: "pK4s9zC3wQ",
    description: "Error when deleting a Studio plugin connection fails",
  },
  deleteSucceeded: {
    defaultMessage: "Studio plugin connection removed.",
    id: "mR7u1aE5yH",
    description: "Toast when a Studio plugin connection is removed",
  },
  displayNameRequired: {
    defaultMessage: "Enter a display name.",
    id: "nT5w2bI8fG",
    description: "Validation when Studio plugin connection display name is empty",
  },
  apiKeyRequired: {
    defaultMessage: "Select an API key.",
    id: "qW3e6oL9dV",
    description: "Validation when Studio plugin connection API key is missing",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "xC8h4jP1sM",
    description: "Label for Studio plugin connection display name field",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: "yD2k7nR5tB",
    description: "Label for Studio plugin connection API key field",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "zE9m3qU6vF",
    description: "Button to add a Studio plugin connection",
  },
  enabled: {
    defaultMessage: "Enabled",
    id: "aF1p4rW8xH",
    description: "Badge when a Studio plugin connection is enabled",
  },
  oauthHint: {
    defaultMessage:
      "Editors connect from the Hyperlocalise inspector in Studio via OAuth. Each grant is bound to that Studio origin.",
    id: "bG5s6tY2zJ",
    description: "Help text explaining Studio plugin OAuth",
  },
});
