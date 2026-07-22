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

export const teamDialogMessages = defineMessages({
  nameLabel: {
    defaultMessage: "Name",
    id: "a74JhYiAwS",
    description: "Label for the team name field",
  },
  namePlaceholder: {
    defaultMessage: "Localization",
    id: "jwBq0AHFrW",
    description: "Placeholder for the team name field",
  },
  slugLabel: {
    defaultMessage: "Slug",
    id: "V9wej2JTKV",
    description: "Label for the team slug field",
  },
  slugPlaceholder: {
    defaultMessage: "localization",
    id: "KHmNU2OTMW",
    description: "Placeholder for the team slug field",
  },
  slugDescription: {
    defaultMessage:
      "Used in URLs and project scoping. Lowercase letters, numbers, and hyphens only.",
    id: "zg0fvgxUv4",
    description: "Helper text under the team slug field",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "kA73rJ1hM2",
    description: "Cancel button in the team dialog footer",
  },
  saving: {
    defaultMessage: "Saving...",
    id: "U+Ll/sGDKs",
    description: "Submit button label while a team is being saved",
  },
  createTeam: {
    defaultMessage: "Create team",
    id: "NkvwsDHwcu",
    description: "Submit button to create a team",
  },
  saveChanges: {
    defaultMessage: "Save changes",
    id: "+HZaUMLm0i",
    description: "Submit button to save team edits",
  },
});
