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
    id: "KLP0H0Bm8w",
    description: "Name shown for the Ahrefs integrations row",
  },
  rowDescription: {
    defaultMessage: "Connect an Ahrefs MCP API key for SEO data in automations.",
    id: "r6HEWfXC5D",
    description: "Description for the Ahrefs integrations row",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "bdbVTOv5Bm",
    description: "Button to add a new Ahrefs connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "jNTPuVa8uZ",
    description: "Label for Ahrefs display name field",
  },
  apiKeyLabel: {
    defaultMessage: "MCP API key",
    id: "vyEG2Rrj4a",
    description: "Label for Ahrefs MCP API key field",
  },
  apiKeyHelp: {
    defaultMessage:
      "Generate an MCP key in Ahrefs Account Settings → API Keys. Automations authenticate with Authorization: Bearer.",
    id: "2EB3wgNEGj",
    description: "Help text for where to find an Ahrefs MCP API key",
  },
  save: {
    defaultMessage: "Save",
    id: "Tr3_f_b-E4",
    description: "Save Ahrefs connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "eBTNMHRzsx",
    description: "Cancel adding Ahrefs connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "WUhmkuWno_",
    description: "Delete Ahrefs connection button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load Ahrefs connections.",
    id: "oDR2kKlwsc",
    description: "Error when Ahrefs connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save Ahrefs connection.",
    id: "jy0fxxjZxd",
    description: "Error when Ahrefs connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "Ahrefs connection saved.",
    id: "t7yeS7VAje",
    description: "Toast when Ahrefs connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete Ahrefs connection.",
    id: "V-PkRAMN_s",
    description: "Error when Ahrefs connection delete fails",
  },
  deleteInUse: {
    defaultMessage: "Remove this Ahrefs connection from automations before deleting it.",
    id: "RqJFnFdbhG",
    description: "Error when deleting an Ahrefs connection still used by automations",
  },
  deleteSucceeded: {
    defaultMessage: "Ahrefs connection deleted.",
    id: "qSJAyVlIfJ",
    description: "Toast when Ahrefs connection is deleted",
  },
  emptyState: {
    defaultMessage: "No Ahrefs connections yet.",
    id: "q1odur6ptQ",
    description: "Empty state when no Ahrefs connections exist",
  },
  tokenConfigured: {
    defaultMessage: "API key ending in {suffix}",
    id: "Fw-DAiV4t2",
    description: "Hint that an Ahrefs API key is already stored",
  },
  apiKeyRequired: {
    defaultMessage: "Enter an Ahrefs MCP API key.",
    id: "Xucm4d5P0P",
    description: "Validation error when Ahrefs MCP API key is missing on create",
  },
});
