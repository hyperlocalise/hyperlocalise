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

export const storyblokConnectionPanelMessages = defineMessages({
  fetchConnectionsFailed: {
    id: "CXhmOtzwtQ",
    defaultMessage: "Could not load Storyblok connections.",
    description: "Error when the Storyblok connections list fails to load",
  },
  saveFailed: {
    id: "eDxCB+Kz/L",
    defaultMessage: "Could not save the Storyblok connection.",
    description: "Error when saving a Storyblok connection fails",
  },
  saveLimitReached: {
    id: "KHA0X60qT6",
    defaultMessage:
      "Your plan's integration limit is reached. Remove another integration or upgrade to connect Storyblok.",
    description: "Error when saving a Storyblok connection hits the workspace integration limit",
  },
  saveSuccess: {
    id: "toTUd2mhoh",
    defaultMessage: "Storyblok connection saved.",
    description: "Toast after a Storyblok connection is saved",
  },
  deleteFailed: {
    id: "tY/EOkL8C4",
    defaultMessage: "Could not remove the Storyblok connection.",
    description: "Error when removing a Storyblok connection fails",
  },
  deleteSuccess: {
    id: "3VvnGM3Q62",
    defaultMessage: "Storyblok connection removed.",
    description: "Toast after a Storyblok connection is removed",
  },
  discoverFailed: {
    id: "u9NLbk5cd6",
    defaultMessage: "Could not load Storyblok spaces for this token.",
    description: "Fallback error when loading Storyblok spaces for a token fails",
  },
  tokenRequired: {
    id: "xisOV3z/p5",
    defaultMessage: "Paste a Storyblok personal access token.",
    description: "Error when saving a new Storyblok connection without a token",
  },
  spaceRequired: {
    id: "OhuQSgXqhd",
    defaultMessage: "Choose a space.",
    description: "Error when saving a Storyblok connection without a space",
  },
  displayNameLabel: {
    id: "Huf0QjYPX1",
    defaultMessage: "Display name",
    description: "Label for the Storyblok connection display name field",
  },
  regionLabel: {
    id: "owvs5sOUYa",
    defaultMessage: "Space region",
    description: "Label for the Storyblok space region select",
  },
  regionDescription: {
    id: "5XPryAfAvG",
    defaultMessage: "The region your Storyblok space was created in.",
    description: "Help text for the Storyblok space region select",
  },
  regionEu: {
    id: "iBzYrQs7X5",
    defaultMessage: "Europe",
    description: "Storyblok region option for Europe",
  },
  regionUs: {
    id: "7NaqKqiaSL",
    defaultMessage: "United States",
    description: "Storyblok region option for the United States",
  },
  regionCa: {
    id: "W+QeODx8EP",
    defaultMessage: "Canada",
    description: "Storyblok region option for Canada",
  },
  regionAp: {
    id: "w5tiCWLnlv",
    defaultMessage: "Australia",
    description: "Storyblok region option for Australia",
  },
  regionCn: {
    id: "EKQP/VhEKR",
    defaultMessage: "China",
    description: "Storyblok region option for China",
  },
  accessTokenLabel: {
    id: "bgbvTDFx0f",
    defaultMessage: "Personal access token",
    description: "Label for the Storyblok personal access token field",
  },
  accessTokenDescription: {
    id: "HTnAdmO5ZW",
    defaultMessage:
      "Create one in Storyblok under My account → Personal access tokens. It needs access to the space you want to translate. The space's plan must include translation export and import.",
    description: "Help text for the Storyblok personal access token field",
  },
  accessTokenKeepPlaceholder: {
    id: "l8KAREfmsp",
    defaultMessage: "Leave blank to keep the current token",
    description: "Placeholder for the Storyblok token field when a token is already saved",
  },
  maskedToken: {
    id: "A5c1wg40CQ",
    defaultMessage: "Token {suffix}",
    description: "Shows the last characters of the saved Storyblok token",
  },
  spaceLabel: {
    id: "oGwbbTEW21",
    defaultMessage: "Space",
    description: "Label for the Storyblok space select",
  },
  spacePlaceholder: {
    id: "FiX+C2m3fm",
    defaultMessage: "Select a space",
    description: "Placeholder for the Storyblok space select",
  },
  languagesLabel: {
    id: "gJin7Ln/KQ",
    defaultMessage: "Languages: {languages}",
    description: "Lists the translation languages configured on the Storyblok space",
  },
  noLanguages: {
    id: "+vOb5y92d4",
    defaultMessage:
      "This space has no translation languages yet. Add them in Storyblok under Settings → Internationalization.",
    description: "Warning when the Storyblok space has no translation languages",
  },
  exportUnavailable: {
    id: "8rGGckkgct",
    defaultMessage:
      "This space's plan doesn't include translation export and import, so it can't be connected.",
    description: "Warning when the Storyblok space plan lacks translation export",
  },
  foldersLabel: {
    id: "O3i4OwJY2O",
    defaultMessage: "Folders",
    description: "Label for the Storyblok folder picker",
  },
  foldersDescription: {
    id: "Mg+PtIeObo",
    defaultMessage:
      "Import stories from these folders only. Leave all unticked to import every story.",
    description: "Help text for the Storyblok folder picker",
  },
  saveConnection: {
    id: "Ox+z02eprO",
    defaultMessage: "Save connection",
    description: "Button that saves the Storyblok connection",
  },
  disconnect: {
    id: "8bHw8mNhtI",
    defaultMessage: "Disconnect",
    description: "Button that removes the Storyblok connection",
  },
  loadSpaces: {
    id: "umXkHgL0Fa",
    defaultMessage: "Load spaces",
    description: "Button that checks the Storyblok token and loads its spaces",
  },
});
