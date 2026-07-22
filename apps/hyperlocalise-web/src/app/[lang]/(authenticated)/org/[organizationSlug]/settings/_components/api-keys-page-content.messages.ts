"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const apiKeysPageContentMessages = defineMessages({
  neverUsed: {
    defaultMessage: "Never",
    id: "RcUcWXknuU",
    description: "Shown when an API key has never been used",
  },
  loadFailed: {
    defaultMessage: "Failed to load API keys",
    id: "sCwvAHmqAI",
    description: "Error when the API keys list request fails",
  },
  createFailed: {
    defaultMessage: "Failed to create API key",
    id: "vHkuFGKp7T",
    description: "Error when creating an API key fails",
  },
  revokeFailed: {
    defaultMessage: "Failed to revoke API key",
    id: "NisKtP5fCJ",
    description: "Error when revoking an API key fails",
  },
  revokedToast: {
    defaultMessage: "API key revoked",
    id: "4Nb8hxfYt5",
    description: "Success toast after revoking an API key",
  },
  copiedToast: {
    defaultMessage: "API key copied to clipboard",
    id: "bXM2sr8gtz",
    description: "Success toast after copying a newly created API key",
  },
  copyFailedToast: {
    defaultMessage: "Failed to copy to clipboard",
    id: "TrnH0+MELk",
    description: "Error toast when clipboard copy fails",
  },
  pageLabel: {
    defaultMessage: "Workspace settings",
    id: "ksrwIvV64s",
    description: "Breadcrumb-style label above the API keys page title",
  },
  pageTitle: {
    defaultMessage: "API Keys",
    id: "VZ/tPAEVdg",
    description: "API keys settings page heading",
  },
  pageDescription: {
    defaultMessage:
      "Create and manage API keys for programmatic access to translation jobs and workspace resources. Keep keys secure and rotate them regularly.",
    id: "nE4gAmZP2R",
    description: "API keys settings page description",
  },
  createButton: {
    defaultMessage: "Create API key",
    id: "VH9bOCu5nr",
    description: "Button to open the create API key dialog",
  },
  sectionAriaLabel: {
    defaultMessage: "API keys",
    id: "P8buB19/yY",
    description: "Accessible label for the API keys list section",
  },
  loading: {
    defaultMessage: "Loading API keys...",
    id: "ZC65JlwD3i",
    description: "Loading state while fetching API keys",
  },
  loadErrorTitle: {
    defaultMessage: "API keys failed to load.",
    id: "z5++P6iegy",
    description: "Error title when the API keys list fails to load",
  },
  loadErrorFallback: {
    defaultMessage: "Refresh the page to try again.",
    id: "Bh7oPsMHrP",
    description: "Fallback error guidance when loading API keys fails",
  },
  emptyTitle: {
    defaultMessage: "No API keys yet",
    id: "K0Maj++lc6",
    description: "Empty state title when the workspace has no API keys",
  },
  emptyDescription: {
    defaultMessage:
      "Create a key to authenticate scripts, CI jobs, and integrations against this workspace.",
    id: "V/CBn2NY6n",
    description: "Empty state description for the API keys list",
  },
  maskedKeyPrefix: {
    defaultMessage: "{prefix}••••••••",
    id: "CWXh32oIoB",
    description: "Masked API key prefix shown in the keys list",
  },
  permissions: {
    defaultMessage: "Permissions: {permissions}",
    id: "VUwFgX4OmD",
    description: "API key row showing granted permissions",
  },
  createdAt: {
    defaultMessage: "Created {date}",
    id: "NX9i6pdgvw",
    description: "API key row showing creation timestamp",
  },
  lastUsed: {
    defaultMessage: "Last used {date}",
    id: "60PQQ7C+fN",
    description: "API key row showing last-used timestamp",
  },
  revoke: {
    defaultMessage: "Revoke",
    id: "6RuyJHJCyu",
    description: "Button to open the revoke API key confirmation dialog",
  },
  createDialogTitle: {
    defaultMessage: "Create API key",
    id: "IJDgzVk+ER",
    description: "Title of the create API key dialog before the key is generated",
  },
  createdDialogTitle: {
    defaultMessage: "API key created",
    id: "0+lekb0oBh",
    description: "Title of the create API key dialog after the key is generated",
  },
  createDialogDescription: {
    defaultMessage: "Give your key a name so you can identify it later.",
    id: "ScpiJIZOJM",
    description: "Description in the create API key dialog before generation",
  },
  createdDialogDescription: {
    defaultMessage: "Copy this key now. You will not be able to see it again.",
    id: "HZrRUnuo70",
    description: "Warning shown after an API key is created",
  },
  copied: {
    defaultMessage: "Copied",
    id: "++VvL4EEbo",
    description: "Copy button label after the API key was copied",
  },
  copy: {
    defaultMessage: "Copy",
    id: "5eoi21fmqC",
    description: "Button to copy the newly created API key",
  },
  keyNameLabel: {
    defaultMessage: "Key name",
    id: "ZuaK6pQTdl",
    description: "Label for the API key name field",
  },
  keyNamePlaceholder: {
    defaultMessage: "e.g. Production CI",
    id: "9uVn8mc+mK",
    description: "Placeholder for the API key name field",
  },
  done: {
    defaultMessage: "Done",
    id: "jh2RfUdWl3",
    description: "Button to close the create API key dialog after copying the key",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "whnz/Xptx4",
    description: "Cancel button in API key dialogs",
  },
  creating: {
    defaultMessage: "Creating...",
    id: "d4ixdVNgC5",
    description: "Create API key button label while the request is pending",
  },
  createKey: {
    defaultMessage: "Create key",
    id: "pwrS5bq0q7",
    description: "Submit button to create an API key",
  },
  revokeDialogTitle: {
    defaultMessage: "Revoke API key",
    id: "DSm/l7fomX",
    description: "Title of the revoke API key confirmation dialog",
  },
  revokeDialogDescription: {
    defaultMessage:
      "This key will immediately lose access to the workspace API. Any integrations using it will stop working.",
    id: "sishbO9DCq",
    description: "Description in the revoke API key confirmation dialog",
  },
  revoking: {
    defaultMessage: "Revoking...",
    id: "zMB0hQFeRq",
    description: "Revoke API key button label while the request is pending",
  },
  revokeKey: {
    defaultMessage: "Revoke key",
    id: "S2pzZyn+jp",
    description: "Confirm button to revoke an API key",
  },
});
