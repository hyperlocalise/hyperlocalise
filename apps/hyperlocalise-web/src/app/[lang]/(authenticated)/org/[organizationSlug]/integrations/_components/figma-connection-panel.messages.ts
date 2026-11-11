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

export const figmaConnectionPanelMessages = defineMessages({
  rowName: {
    defaultMessage: "Figma",
    id: "LAhLwqc2EA",
    description: "Name shown for the Figma integrations row",
  },
  rowDescription: {
    defaultMessage:
      "Create a workspace connection here. Designers then sign in from Figma with OAuth.",
    id: "ojIy177KR7",
    description: "Description for the Figma integrations row",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "TD3EETjvkY",
    description: "Button to add a new Figma connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "ZkAbhQobmZ",
    description: "Label for Figma display name field",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: "vmv1R5ICX0",
    description: "Label for the API key used by a Figma connection",
  },
  apiKeyHelp: {
    defaultMessage: "Choose a workspace API key with files and jobs read/write access.",
    id: "8Oj/NozToL",
    description: "Help text for the Figma API key picker",
  },
  apiKeyPlaceholder: {
    defaultMessage: "Select an API key",
    id: "6zcjX66YhX",
    description: "Placeholder for the Figma API key picker",
  },
  save: {
    defaultMessage: "Save",
    id: "ihICBXS5Mu",
    description: "Save Figma connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "+hYvvi6oXu",
    description: "Cancel adding Figma connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "q8XoGsQB0C",
    description: "Delete Figma connection button",
  },
  regenerate: {
    defaultMessage: "Regenerate token",
    id: "h4LTn78oL0",
    description: "Regenerate Figma connection token button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load Figma connections.",
    id: "PqA9E3tXEb",
    description: "Error when Figma connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save Figma connection.",
    id: "iaKQFI88/f",
    description: "Error when Figma connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "Figma connection saved.",
    id: "u/fBB4HZhM",
    description: "Toast when Figma connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete Figma connection.",
    id: "zIdwJ1idG9",
    description: "Error when Figma connection delete fails",
  },
  deleteSucceeded: {
    defaultMessage: "Figma connection deleted.",
    id: "FamtHptssa",
    description: "Toast when Figma connection is deleted",
  },
  regenerateFailed: {
    defaultMessage: "Failed to regenerate the Figma connection token.",
    id: "GbD3NV3O9z",
    description: "Error when Figma token regeneration fails",
  },
  tokenDialogTitle: {
    defaultMessage: "Copy this Figma connection token",
    id: "y50SdunZtN",
    description: "Title for the one-time Figma token reveal dialog",
  },
  tokenDialogDescription: {
    defaultMessage:
      "Local development only. This token is shown once. Paste it into a locally running Figma app. Production uses Connect Hyperlocalise (OAuth).",
    id: "Supl3UvqqT",
    description: "Description for the one-time Figma token reveal dialog",
  },
  copyToken: {
    defaultMessage: "Copy token",
    id: "UNu4p11x2h",
    description: "Copy Figma connection token button",
  },
  copied: {
    defaultMessage: "Copied",
    id: "31JruwfzqD",
    description: "Copied confirmation for Figma connection token",
  },
  done: {
    defaultMessage: "Done",
    id: "Dtr9SPmsqm",
    description: "Dismiss Figma token dialog button",
  },
  tokenPrefix: {
    defaultMessage: "Token starting with {prefix}",
    id: "W9Pt1ytVfg",
    description: "Hint showing the stored Figma connection token prefix",
  },
  brandBound: {
    defaultMessage: "Linked to Figma brand {brandId}",
    id: "gGRRIh5EV/",
    description: "Shows the Figma brand bound to a connection",
  },
  enabled: {
    defaultMessage: "Enabled",
    id: "eqeg8nHR3p",
    description: "Badge shown when a Figma connection is enabled",
  },
  displayNameRequired: {
    defaultMessage: "Enter a display name.",
    id: "adR2DRzo2Q",
    description: "Validation error when Figma display name is missing",
  },
  apiKeyRequired: {
    defaultMessage: "Choose an API key.",
    id: "Mpd2ZhrVg/",
    description: "Validation error when Figma API key is missing",
  },
  noEligibleApiKeys: {
    defaultMessage: "Create an API key with files and jobs permissions first.",
    id: "6GvRaMOu4p",
    description: "Empty state when no eligible API keys exist for Figma",
  },
  authorize: {
    defaultMessage: "Authorize Figma",
    id: "BicOZ7c8PB",
    description: "Authorize the pending Figma app claim",
  },
  authorizeSucceeded: {
    defaultMessage: "Figma app authorized. Return to Figma to finish connecting.",
    id: "JQZCOawuKC",
    description: "Toast when a Figma claim is authorized",
  },
  authorizeFailed: {
    defaultMessage: "Failed to authorize the Figma app.",
    id: "py0C/2fMk8",
    description: "Error when Figma claim authorization fails",
  },
  claimPageTitle: {
    defaultMessage: "Connect Figma",
    id: "VhvPvEqliZ",
    description: "Title for the Figma claim authorization page",
  },
  claimPageDescription: {
    defaultMessage: "Choose a connection to authorize this Figma app install.",
    id: "5C3EksSWTF",
    description: "Description for the Figma claim authorization page",
  },
  claimMissing: {
    defaultMessage: "This Figma connect request is missing or expired.",
    id: "UwAnfXP81g",
    description: "Error when a Figma claim id is missing",
  },
});
