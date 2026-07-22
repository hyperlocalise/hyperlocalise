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

export const semrushConnectionPanelMessages = defineMessages({
  rowName: {
    defaultMessage: "Semrush",
    id: "75DautUGXW",
    description: "Name shown for the Semrush integrations row",
  },
  rowDescription: {
    defaultMessage: "Connect a Semrush API key for SEO and traffic data in automations.",
    id: "5N7UDRdane",
    description: "Description for the Semrush integrations row",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "RHfBrqrbnQ",
    description: "Button to add a new Semrush connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "3ggwxElkQA",
    description: "Label for Semrush display name field",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: "+G0v8S+Z5x",
    description: "Label for Semrush API key field",
  },
  apiKeyHelp: {
    defaultMessage:
      "Find your key in the Semrush API settings. Automations authenticate with Authorization: Apikey.",
    id: "0l4RNVGmUQ",
    description: "Help text for where to find a Semrush API key",
  },
  save: {
    defaultMessage: "Save",
    id: "0eU/dl/Oha",
    description: "Save Semrush connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "uYwF7v8b0H",
    description: "Cancel adding Semrush connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "CSG8FIAxsD",
    description: "Delete Semrush connection button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load Semrush connections.",
    id: "l+wMmn4Krw",
    description: "Error when Semrush connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save Semrush connection.",
    id: "o9256BhMtE",
    description: "Error when Semrush connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "Semrush connection saved.",
    id: "zGlv2WTv64",
    description: "Toast when Semrush connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete Semrush connection.",
    id: "xs2JNm6T2w",
    description: "Error when Semrush connection delete fails",
  },
  deleteSucceeded: {
    defaultMessage: "Semrush connection deleted.",
    id: "Qiz/awCu+C",
    description: "Toast when Semrush connection is deleted",
  },
  emptyState: {
    defaultMessage: "No Semrush connections yet.",
    id: "REOBtpoOI7",
    description: "Empty state when no Semrush connections exist",
  },
  tokenConfigured: {
    defaultMessage: "API key ending in {suffix}",
    id: "ey4FPcP+AI",
    description: "Hint that a Semrush API key is already stored",
  },
  apiKeyRequired: {
    defaultMessage: "Enter a Semrush API key.",
    id: "+1a6pZauYN",
    description: "Validation error when Semrush API key is missing on create",
  },
});
