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

export const guidelineUploadMessages = defineMessages({
  title: {
    defaultMessage: "Upload guideline",
    id: "02+MHdtp18",
    description: "Title for the dedicated guideline upload page",
  },
  description: {
    defaultMessage: "Add documents to the guideline, or type guidance directly below.",
    id: "bV7SMCX/7M",
    description: "Description for the guideline upload page",
  },
  backToGuideline: {
    defaultMessage: "Back to Guideline",
    id: "fGjKs76+lc",
    description: "Link back to the Guideline page from the upload page",
  },
  projectScopeLabel: {
    defaultMessage: "Projects",
    id: "TVH49oxDSg",
    description: "Label for the project scope picker on the upload page",
  },
  projectScopeHint: {
    defaultMessage:
      "None saves the guideline without applying it. All applies it to every current and future project.",
    id: "V00IPtkczH",
    description: "Hint for the project scope picker",
  },
  projectScopeNone: {
    defaultMessage: "None",
    id: "T+Zz9BNYwB",
    description: "Project scope option for no projects",
  },
  projectScopeAll: {
    defaultMessage: "All",
    id: "5a15156ue+",
    description: "Project scope option for all projects",
  },
  projectScopeSelected: {
    defaultMessage: "Selected",
    id: "tkB+3J0DjZ",
    description: "Project scope option for selected projects",
  },
  noProjects: {
    defaultMessage: "No projects yet.",
    id: "Y57/WAIdth",
    description: "Empty state when there are no projects to select",
  },
  localesLabel: {
    defaultMessage: "Locales (empty means all locales)",
    id: "HXfvxDUO8O",
    description: "Label for the locales field on the upload page",
  },
  uploadFile: {
    defaultMessage: "Upload",
    id: "fi083Ov+bg",
    description: "Uploads the staged guideline file with the selected locales and project scope",
  },
  projectRequired: {
    defaultMessage: "Select at least one project before uploading.",
    id: "GoT5vi8Wd3",
    description: "Error when Selected project scope has no projects checked",
  },
  assignFailed: {
    defaultMessage: "Could not assign this guideline to the selected projects.",
    id: "m7oPwUF2VA",
    description: "Error when attaching a new guideline to projects fails",
  },
});
