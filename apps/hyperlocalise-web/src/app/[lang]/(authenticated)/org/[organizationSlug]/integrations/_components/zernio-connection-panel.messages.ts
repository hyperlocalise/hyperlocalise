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

export const zernioConnectionPanelMessages = defineMessages({
  rowName: {
    defaultMessage: "Zernio",
    id: "WcvwVzjDrA",
    description: "Name shown for the Zernio integrations row",
  },
  rowDescription: {
    defaultMessage:
      "Connect a Zernio API key to create ads across Meta, Google, TikTok, LinkedIn, and more.",
    id: "RlupnQbi5m",
    description: "Description for the Zernio integrations row",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "kbsJHfvLxl",
    description: "Button to add a new Zernio connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "ZAdSzM16Za",
    description: "Label for Zernio display name field",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: "cEHbuBBOss",
    description: "Label for Zernio API key field",
  },
  apiKeyHelp: {
    defaultMessage:
      "Create a key in Zernio under API keys. Automations authenticate with Authorization: Bearer.",
    id: "UDTP3K5J0j",
    description: "Help text for where to find a Zernio API key",
  },
  save: {
    defaultMessage: "Save",
    id: "D/4WiILgjn",
    description: "Save Zernio connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "vAB5ykBgcy",
    description: "Cancel adding Zernio connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "/IjuPrxPne",
    description: "Delete Zernio connection button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load Zernio connections.",
    id: "iohP8x/4Gk",
    description: "Error when Zernio connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save Zernio connection.",
    id: "xF8a5VYwdT",
    description: "Error when Zernio connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "Zernio connection saved.",
    id: "+7Ium7kICt",
    description: "Toast when Zernio connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete Zernio connection.",
    id: "NXpHw/fqLM",
    description: "Error when Zernio connection delete fails",
  },
  deleteInUse: {
    defaultMessage: "Remove this Zernio connection from automations before deleting it.",
    id: "VGmQfcA1bL",
    description: "Error when deleting a Zernio connection still used by automations",
  },
  deleteSucceeded: {
    defaultMessage: "Zernio connection deleted.",
    id: "AWg8odjknZ",
    description: "Toast when Zernio connection is deleted",
  },
  tokenConfigured: {
    defaultMessage: "API key ending in {suffix}",
    id: "2SPuScjz1x",
    description: "Hint that a Zernio API key is already stored",
  },
  apiKeyRequired: {
    defaultMessage: "Enter a Zernio API key.",
    id: "UBkabx89xG",
    description: "Validation error when Zernio API key is missing on create",
  },
  enabled: {
    defaultMessage: "Enabled",
    id: "Pq7Qwu7wbl",
    description: "Badge shown when a Zernio connection is enabled",
  },
});
