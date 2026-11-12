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
    defaultMessage: "New guideline",
    id: "QsSsdNtNce",
    description: "Title for the dedicated guideline upload page",
  },
  description: {
    defaultMessage:
      "Upload a document or write guidance in Markdown, then choose where it applies.",
    id: "TjYKhFORSD",
    description: "Description for the guideline upload page",
  },
  backToGuideline: {
    defaultMessage: "Back to Guideline",
    id: "fGjKs76+lc",
    description: "Link back to the Guideline page from the upload page",
  },
  appliesToHeading: {
    defaultMessage: "Applies to",
    id: "c5rN3aZahB",
    description: "Heading for the guideline locale and project scope panel",
  },
  localesLabel: {
    defaultMessage: "Locales",
    id: "LUBBcMCqmP",
    description: "Label for the locales field on the upload page",
  },
  localesHint: {
    defaultMessage: "Leave empty to apply to every locale.",
    id: "BwlhXjlmlH",
    description: "Hint under the guideline locales field",
  },
  localesSearchPlaceholder: {
    defaultMessage: "Search locales",
    id: "3DEOC6N6c2",
    description: "Placeholder for the guideline locales field when locales are selected",
  },
  noMatchingLocales: {
    defaultMessage: "No matching locales.",
    id: "mJaEzOd6zP",
    description: "Empty state when the locale search has no results",
  },
  addCustomLocale: {
    defaultMessage: "Add “{locale}”",
    id: "uYjT3rpNvo",
    description: "Option to add a typed custom locale code",
  },
  removeItem: {
    defaultMessage: "Remove {item}",
    id: "ra1klq4v5X",
    description: "Accessible label for removing a selected locale or project chip",
  },
  projectScopeLabel: {
    defaultMessage: "Projects",
    id: "TVH49oxDSg",
    description: "Label for the project scope picker on the upload page",
  },
  projectScopeNone: {
    defaultMessage: "Not assigned",
    id: "sO7rnP0h3L",
    description: "Project scope option for no projects",
  },
  projectScopeAll: {
    defaultMessage: "All projects",
    id: "wF1nA47IyK",
    description: "Project scope option for all projects",
  },
  projectScopeSelected: {
    defaultMessage: "Specific projects",
    id: "Bucdx9Ly3x",
    description: "Project scope option for selected projects",
  },
  projectScopeNoneHint: {
    defaultMessage: "Saved to your library. Assign it to projects later.",
    id: "1WGZELAMa0",
    description: "Hint for the None project scope option",
  },
  projectScopeAllHint: {
    defaultMessage: "Applies to every current and future project.",
    id: "g3KcdYvQQN",
    description: "Hint for the All project scope option",
  },
  projectScopeSelectedHint: {
    defaultMessage: "Applies only to the projects you choose.",
    id: "V2Qr2eeAmU",
    description: "Hint for the Selected project scope option",
  },
  projectsSearchPlaceholder: {
    defaultMessage: "Search projects",
    id: "EUFoxykwLu",
    description: "Placeholder for the project multi-select on the guideline upload page",
  },
  noMatchingProjects: {
    defaultMessage: "No matching projects.",
    id: "7YmD9eUmEZ",
    description: "Empty state when the project search has no results",
  },
  noProjects: {
    defaultMessage: "No projects yet.",
    id: "Y57/WAIdth",
    description: "Empty state when there are no projects to select",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "ZbskdkZnq2",
    description: "Cancel button on the guideline upload page",
  },
  uploadFile: {
    defaultMessage: "Upload guideline",
    id: "6TquvwEI3U",
    description: "Uploads the staged guideline file with the selected locales and project scope",
  },
  chooseFileHint: {
    defaultMessage: "Choose a file, or write it in Markdown.",
    id: "U+3chZ6zsr",
    description: "Footer hint on the guideline upload page before a file is selected",
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
  localesAll: {
    defaultMessage: "All locales",
    id: "wOweFU6gYj",
    description: "Locales pill value when no locale is selected",
  },
  localesCount: {
    defaultMessage: "{count, plural, one {# locale} other {# locales}}",
    id: "YhsUO+V2gk",
    description: "Locales pill value when several locales are selected",
  },
  clear: {
    defaultMessage: "Clear",
    id: "EGOIdr2O/o",
    description: "Clears the selected locales",
  },
  projectsChooseSummary: {
    defaultMessage: "Choose projects",
    id: "fb5bUqDZgY",
    description: "Projects pill value when Selected scope has no projects yet",
  },
  projectsCount: {
    defaultMessage: "{count, plural, one {# project} other {# projects}}",
    id: "dyWZf/GCEm",
    description: "Projects pill value when several projects are selected",
  },
});
