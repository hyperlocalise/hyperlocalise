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

export const guidelineProjectDocumentPickerMessages = defineMessages({
  sectionTitle: {
    defaultMessage: "Assign new guideline",
    id: "p2i3sZqWF/",
    description: "Subheading for assigning an org guideline to the current project",
  },
  sectionDescription: {
    defaultMessage:
      "Pick an organization guideline that is not scoped to all projects and assign it to this project.",
    id: "TPD0ka6ZHC",
    description: "Help text below Assign new guideline on a project page",
  },
  selectGuideline: {
    defaultMessage: "Select a guideline",
    id: "UbjS7TWxTi",
    description: "Placeholder for the guideline picker on a project page",
  },
  assign: {
    defaultMessage: "Assign",
    id: "AoZj8cJFcg",
    description: "Assign the selected guideline to this project",
  },
  assignFailed: {
    defaultMessage: "Could not assign this guideline.",
    id: "3FmDkdpkKi",
    description: "Error when attaching a guideline to a project fails",
  },
});
