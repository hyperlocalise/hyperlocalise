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

export const intercomConnectionPanelMessages = defineMessages({
  rowName: {
    defaultMessage: "Intercom",
    id: "JRTnSLtq//",
    description: "Name shown for the Intercom integrations row",
  },
  rowDescription: {
    defaultMessage: "Connect an Intercom access token for Help Center content.",
    id: "LBBqTZQKA3",
    description: "Description for the Intercom integrations row",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "E0jx/ueMaN",
    description: "Button to add a new Intercom connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "ZZsyqRkYsB",
    description: "Label for Intercom display name field",
  },
  accessTokenLabel: {
    defaultMessage: "Access token",
    id: "x/Kqcar7eA",
    description: "Label for Intercom access token field",
  },
  accessTokenHelp: {
    defaultMessage: "Create an access token in the Intercom Developer Hub for your workspace.",
    id: "Csa9NF0Qo2",
    description: "Help text for where to find an Intercom access token",
  },
  restEndpointLabel: {
    defaultMessage: "REST endpoint",
    id: "cx00LgHL3+",
    description: "Label for Intercom regional REST endpoint select",
  },
  restEndpointHelp: {
    defaultMessage: "Choose the region where your Intercom workspace is hosted.",
    id: "Mojh5Scg1j",
    description: "Help text for Intercom regional REST endpoint select",
  },
  restEndpointUs: {
    defaultMessage: "US (api.intercom.io)",
    id: "Dsh7E+5ifE",
    description: "US Intercom REST endpoint option label",
  },
  restEndpointEu: {
    defaultMessage: "Europe (api.eu.intercom.io)",
    id: "or2nJ8Fbp+",
    description: "Europe Intercom REST endpoint option label",
  },
  restEndpointAu: {
    defaultMessage: "Australia (api.au.intercom.io)",
    id: "QNpNdcu+Mx",
    description: "Australia Intercom REST endpoint option label",
  },
  save: {
    defaultMessage: "Save",
    id: "3Z+3pA/kaR",
    description: "Save Intercom connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "mBNLdtt327",
    description: "Cancel adding Intercom connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "0czRTKBGYl",
    description: "Delete Intercom connection button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load Intercom connections.",
    id: "mObQkKgd8s",
    description: "Error when Intercom connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save Intercom connection.",
    id: "e9lzOZ7/lz",
    description: "Error when Intercom connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "Intercom connection saved.",
    id: "S0eNIe6iwe",
    description: "Toast when Intercom connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete Intercom connection.",
    id: "gbtHgYP/IG",
    description: "Error when Intercom connection delete fails",
  },
  deleteSucceeded: {
    defaultMessage: "Intercom connection deleted.",
    id: "+CvStp9tzG",
    description: "Toast when Intercom connection is deleted",
  },
  emptyState: {
    defaultMessage: "No Intercom connections yet.",
    id: "+8igDOrn5C",
    description: "Empty state when no Intercom connections exist",
  },
  tokenConfigured: {
    defaultMessage: "{region} · token ending in {suffix}",
    id: "5Mjf4nqDKl",
    description: "Hint that an Intercom access token is stored, with region",
  },
  accessTokenRequired: {
    defaultMessage: "Enter an Intercom access token.",
    id: "aEn/VDi+Yp",
    description: "Validation error when Intercom access token is missing on create",
  },
  enabled: {
    defaultMessage: "Enabled",
    id: "Qg9jUhHjfz",
    description: "Badge shown when an Intercom connection is enabled",
  },
});
