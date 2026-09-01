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

export const canvaConnectionPanelMessages = defineMessages({
  rowName: {
    defaultMessage: "Canva",
    id: "sOWOEfN8q6",
    description: "Name shown for the Canva integrations row",
  },
  rowDescription: {
    defaultMessage: "Connect the Canva app so designers can localize designs into this workspace.",
    id: "u23kdkT148",
    description: "Description for the Canva integrations row",
  },
  addConnection: {
    defaultMessage: "Add connection",
    id: "liYuh2p3oY",
    description: "Button to add a new Canva connection",
  },
  displayNameLabel: {
    defaultMessage: "Display name",
    id: "R/LlfIB0DY",
    description: "Label for Canva display name field",
  },
  apiKeyLabel: {
    defaultMessage: "API key",
    id: "483Q4BX8oa",
    description: "Label for the API key used by a Canva connection",
  },
  apiKeyHelp: {
    defaultMessage: "Choose a workspace API key with files and jobs read/write access.",
    id: "IqfvPpBfRa",
    description: "Help text for the Canva API key picker",
  },
  projectLabel: {
    defaultMessage: "Project",
    id: "VdPMgzyWOp",
    description: "Label for the project bound to a Canva connection",
  },
  projectHelp: {
    defaultMessage: "Designs localized from Canva are stored in this project.",
    id: "DiXV/bkiCg",
    description: "Help text for the Canva project picker",
  },
  sourceLocaleLabel: {
    defaultMessage: "Source locale",
    id: "/Y3FQ08kzV",
    description: "Label for Canva source locale field",
  },
  targetLocalesLabel: {
    defaultMessage: "Target locales",
    id: "CAun4UHQNn",
    description: "Label for Canva target locales field",
  },
  targetLocalesHelp: {
    defaultMessage: "Comma-separated locale codes, for example es, fr, de.",
    id: "g+80zjC0vY",
    description: "Help text for Canva target locales field",
  },
  save: {
    defaultMessage: "Save",
    id: "bf/8sd/M64",
    description: "Save Canva connection button",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "6A1bUgl3t/",
    description: "Cancel adding Canva connection",
  },
  delete: {
    defaultMessage: "Delete",
    id: "JHq50CfofL",
    description: "Delete Canva connection button",
  },
  regenerate: {
    defaultMessage: "Regenerate token",
    id: "8y3Le4FJl2",
    description: "Regenerate Canva connection token button",
  },
  fetchFailed: {
    defaultMessage: "Failed to load Canva connections.",
    id: "2nsedTf0TG",
    description: "Error when Canva connections cannot be loaded",
  },
  saveFailed: {
    defaultMessage: "Failed to save Canva connection.",
    id: "DkGOoD9Ef+",
    description: "Error when Canva connection save fails",
  },
  saveSucceeded: {
    defaultMessage: "Canva connection saved.",
    id: "vz2IGDAZp1",
    description: "Toast when Canva connection is saved",
  },
  deleteFailed: {
    defaultMessage: "Failed to delete Canva connection.",
    id: "PAC7QvAG7e",
    description: "Error when Canva connection delete fails",
  },
  deleteSucceeded: {
    defaultMessage: "Canva connection deleted.",
    id: "LCEJpmlHkp",
    description: "Toast when Canva connection is deleted",
  },
  regenerateFailed: {
    defaultMessage: "Failed to regenerate the Canva connection token.",
    id: "Z2cMYJ6nRy",
    description: "Error when Canva token regeneration fails",
  },
  tokenDialogTitle: {
    defaultMessage: "Copy this Canva connection token",
    id: "SkGjZiASLT",
    description: "Title for the one-time Canva token reveal dialog",
  },
  tokenDialogDescription: {
    defaultMessage:
      "This token is shown once. Paste it into the Canva app, or use Connect Hyperlocalise from Canva instead.",
    id: "vcGdG7Kss8",
    description: "Description for the one-time Canva token reveal dialog",
  },
  copyToken: {
    defaultMessage: "Copy token",
    id: "rrMT/tukOI",
    description: "Copy Canva connection token button",
  },
  copied: {
    defaultMessage: "Copied",
    id: "X+DJxUtTco",
    description: "Copied confirmation for Canva connection token",
  },
  done: {
    defaultMessage: "Done",
    id: "zrJMUqAnbE",
    description: "Dismiss Canva token dialog button",
  },
  tokenPrefix: {
    defaultMessage: "Token starting with {prefix}",
    id: "uyA3TF6irL",
    description: "Hint showing the stored Canva connection token prefix",
  },
  brandBound: {
    defaultMessage: "Linked to Canva brand {brandId}",
    id: "Xwo9y3RloU",
    description: "Shows the Canva brand bound to a connection",
  },
  enabled: {
    defaultMessage: "Enabled",
    id: "y301nYXIIx",
    description: "Badge shown when a Canva connection is enabled",
  },
  displayNameRequired: {
    defaultMessage: "Enter a display name.",
    id: "yD9TkWr+aV",
    description: "Validation error when Canva display name is missing",
  },
  apiKeyRequired: {
    defaultMessage: "Choose an API key.",
    id: "C0s0NtIxgf",
    description: "Validation error when Canva API key is missing",
  },
  projectRequired: {
    defaultMessage: "Choose a project.",
    id: "dOX1AC82YS",
    description: "Validation error when Canva project is missing",
  },
  noEligibleApiKeys: {
    defaultMessage: "Create an API key with files and jobs permissions first.",
    id: "1c/OEBKiks",
    description: "Empty state when no eligible API keys exist for Canva",
  },
  noProjects: {
    defaultMessage: "Create a project first.",
    id: "pV8l9BOlkk",
    description: "Empty state when no projects exist for Canva",
  },
  authorize: {
    defaultMessage: "Authorize Canva",
    id: "XHcfGv6Nhg",
    description: "Authorize the pending Canva app claim",
  },
  authorizeSucceeded: {
    defaultMessage: "Canva app authorized. Return to Canva to finish connecting.",
    id: "+SujQxAt1L",
    description: "Toast when a Canva claim is authorized",
  },
  authorizeFailed: {
    defaultMessage: "Failed to authorize the Canva app.",
    id: "W78/qWhJir",
    description: "Error when Canva claim authorization fails",
  },
  claimPageTitle: {
    defaultMessage: "Connect Canva",
    id: "S+glJURN8d",
    description: "Title for the Canva claim authorization page",
  },
  claimPageDescription: {
    defaultMessage: "Choose a connection to authorize this Canva app install.",
    id: "/FnHAPAn3P",
    description: "Description for the Canva claim authorization page",
  },
  claimMissing: {
    defaultMessage: "This Canva connect request is missing or expired.",
    id: "D1ORmqTKWQ",
    description: "Error when a Canva claim id is missing",
  },
});
