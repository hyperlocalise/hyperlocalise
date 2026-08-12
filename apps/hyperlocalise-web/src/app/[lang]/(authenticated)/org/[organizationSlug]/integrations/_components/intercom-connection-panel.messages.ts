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
    id: "IcRowName01",
    description: "Name shown for the Intercom integrations row",
  },
  rowDescription: {
    defaultMessage: "Connect an Intercom access token for Help Center content.",
    id: "IcRowDesc01",
    description: "Description for the Intercom integrations row",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "IcAddConn1",
    description: "Button to add a new Intercom connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "IcDispName1",
    description: "Label for Intercom display name field",
  },
  accessTokenLabel: {
    defaultMessage: "Access token",
    id: "IcTokLabel1",
    description: "Label for Intercom access token field",
  },
  accessTokenHelp: {
    defaultMessage:
      "Create an access token in the Intercom Developer Hub for your workspace.",
    id: "IcTokHelp01",
    description: "Help text for where to find an Intercom access token",
  },
  restEndpointLabel: {
    defaultMessage: "REST endpoint",
    id: "IcEpLabel01",
    description: "Label for Intercom regional REST endpoint select",
  },
  restEndpointHelp: {
    defaultMessage: "Choose the region where your Intercom workspace is hosted.",
    id: "IcEpHelp01",
    description: "Help text for Intercom regional REST endpoint select",
  },
  restEndpointUs: {
    defaultMessage: "US (api.intercom.io)",
    id: "IcEpUs0001",
    description: "US Intercom REST endpoint option label",
  },
  restEndpointEu: {
    defaultMessage: "Europe (api.eu.intercom.io)",
    id: "IcEpEu0001",
    description: "Europe Intercom REST endpoint option label",
  },
  restEndpointAu: {
    defaultMessage: "Australia (api.au.intercom.io)",
    id: "IcEpAu0001",
    description: "Australia Intercom REST endpoint option label",
  },
  save: {
    defaultMessage: "Save",
    id: "IcSave0001",
    description: "Save Intercom connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "IcCancel01",
    description: "Cancel adding Intercom connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "IcDelete01",
    description: "Delete Intercom connection button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load Intercom connections.",
    id: "IcFetchFail",
    description: "Error when Intercom connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save Intercom connection.",
    id: "IcSaveFail1",
    description: "Error when Intercom connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "Intercom connection saved.",
    id: "IcSaveOk01",
    description: "Toast when Intercom connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete Intercom connection.",
    id: "IcDelFail1",
    description: "Error when Intercom connection delete fails",
  },
  deleteSucceeded: {
    defaultMessage: "Intercom connection deleted.",
    id: "IcDelOk001",
    description: "Toast when Intercom connection is deleted",
  },
  emptyState: {
    defaultMessage: "No Intercom connections yet.",
    id: "IcEmpty001",
    description: "Empty state when no Intercom connections exist",
  },
  tokenConfigured: {
    defaultMessage: "{region} · token ending in {suffix}",
    id: "IcTokCfg01",
    description: "Hint that an Intercom access token is stored, with region",
  },
  accessTokenRequired: {
    defaultMessage: "Enter an Intercom access token.",
    id: "IcTokReq01",
    description: "Validation error when Intercom access token is missing on create",
  },
  enabled: {
    defaultMessage: "Enabled",
    id: "IcEnabled1",
    description: "Badge shown when an Intercom connection is enabled",
  },
});
