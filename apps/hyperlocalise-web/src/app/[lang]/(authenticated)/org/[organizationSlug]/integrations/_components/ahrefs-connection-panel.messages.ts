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

export const ahrefsConnectionPanelMessages = defineMessages({
  rowName: {
    defaultMessage: "Ahrefs",
    id: "XIim2dhGAT",
    description: "Name shown for the Ahrefs integrations row",
  },
  rowDescription: {
    defaultMessage: "Connect an Ahrefs MCP API key for SEO data in automations.",
    id: "0//CTkn8hx",
    description: "Description for the Ahrefs integrations row",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "zVJ4tC5vy1",
    description: "Button to add a new Ahrefs connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "4mLbuv5vLp",
    description: "Label for Ahrefs display name field",
  },
  apiKeyLabel: {
    defaultMessage: "MCP API key",
    id: "iLIgL6IRUh",
    description: "Label for Ahrefs MCP API key field",
  },
  apiKeyHelp: {
    defaultMessage:
      "Generate an MCP key in Ahrefs Account Settings → API Keys. Automations authenticate with Authorization: Bearer.",
    id: "idzncwhcnS",
    description: "Help text for where to find an Ahrefs MCP API key",
  },
  save: {
    defaultMessage: "Save",
    id: "1Gjnjj0lCU",
    description: "Save Ahrefs connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "WMgcyXfv95",
    description: "Cancel adding Ahrefs connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "nGmfwrX00x",
    description: "Delete Ahrefs connection button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load Ahrefs connections.",
    id: "brJ+Z+0eR1",
    description: "Error when Ahrefs connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save Ahrefs connection.",
    id: "+6nLERHfAh",
    description: "Error when Ahrefs connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "Ahrefs connection saved.",
    id: "XUqaK3JKIx",
    description: "Toast when Ahrefs connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete Ahrefs connection.",
    id: "8XNSkLVgbI",
    description: "Error when Ahrefs connection delete fails",
  },
  deleteInUse: {
    defaultMessage: "Remove this Ahrefs connection from automations before deleting it.",
    id: "yvYYx/4tth",
    description: "Error when deleting an Ahrefs connection still used by automations",
  },
  deleteSucceeded: {
    defaultMessage: "Ahrefs connection deleted.",
    id: "j42TPeiZpP",
    description: "Toast when Ahrefs connection is deleted",
  },
  emptyState: {
    defaultMessage: "No Ahrefs connections yet.",
    id: "gSujo7PJIL",
    description: "Empty state when no Ahrefs connections exist",
  },
  tokenConfigured: {
    defaultMessage: "API key ending in {suffix}",
    id: "0/seAQIJ6N",
    description: "Hint that an Ahrefs API key is already stored",
  },
  apiKeyRequired: {
    defaultMessage: "Enter an Ahrefs MCP API key.",
    id: "3hTiwfSSe8",
    description: "Validation error when Ahrefs MCP API key is missing on create",
  },
  enabled: {
    defaultMessage: "Enabled",
    id: "Ke4jWuGgEM",
    description: "Badge shown when an Ahrefs connection is enabled",
  },
});
