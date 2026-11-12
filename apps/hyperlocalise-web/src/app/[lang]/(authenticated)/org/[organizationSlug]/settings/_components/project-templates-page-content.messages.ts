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
"use client";

import { defineMessages } from "react-intl";

export const projectTemplatesPageContentMessages = defineMessages({
  pageTitle: {
    defaultMessage: "Project templates",
    id: "TDrzDV0j+Z",
    description: "Heading of the project templates settings page",
  },
  pageDescription: {
    defaultMessage:
      "Save the languages, settings, translation memories and glossaries you use again and again. Pick a template when you create a project, or name it in the API with templateId.",
    id: "30noABdnYk",
    description: "Description of the project templates settings page",
  },
  addButton: {
    defaultMessage: "New template",
    id: "LSCdNbg67t",
    description: "Button that opens the dialog to create a project template",
  },
  emptyManager: {
    defaultMessage: "No templates yet. Create one here, or use Save as template on a project.",
    id: "BBTBASUXcH",
    description: "Empty state for managers on the project templates page",
  },
  emptyMember: {
    defaultMessage: "No templates yet. Ask an admin or localization manager to create one.",
    id: "RX8E8g1+dN",
    description: "Empty state for members on the project templates page",
  },
  locales: {
    defaultMessage: "{source} to {targets}",
    id: "M4qKuh9AVn",
    description: "Source and target languages of a project template",
  },
  memoryBadge: {
    defaultMessage: "TM: {name}",
    id: "XVT8LfR91S",
    description: "Badge naming a translation memory a project template attaches",
  },
  glossaryBadge: {
    defaultMessage: "Glossary: {name}",
    id: "A3Dj8gzhuK",
    description: "Badge naming a glossary a project template attaches",
  },
  unnamedResource: {
    defaultMessage: "Unavailable",
    id: "XxW+2ikX1s",
    description: "Name shown for a memory or glossary the viewer can't load",
  },
  edit: {
    defaultMessage: "Edit",
    id: "5GTGLT7lJD",
    description: "Button that edits a project template",
  },
  deleteLabel: {
    defaultMessage: "Delete {name}",
    id: "UgPHp0bv4a",
    description: "Accessible label for the button that deletes a project template",
  },
  deleteTitle: {
    defaultMessage: "Delete this template?",
    id: "BhTZVNrFC1",
    description: "Title of the confirmation dialog for deleting a project template",
  },
  deleteDescription: {
    defaultMessage: "{name} will be removed. Projects already created from it keep their settings.",
    id: "Q4372cmvPx",
    description: "Description of the confirmation dialog for deleting a project template",
  },
  deleteConfirm: {
    defaultMessage: "Delete template",
    id: "8cqgYbmwxF",
    description: "Button that confirms deleting a project template",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "Yk9Fi7wHa2",
    description: "Button that closes the delete template confirmation",
  },
  loadFailed: {
    defaultMessage: "Couldn't load project templates.",
    id: "+cUNOVeSWp",
    description: "Error when project templates fail to load",
  },
  saveFailed: {
    defaultMessage: "Couldn't save the template.",
    id: "Y1aLi3HRj0",
    description: "Error when a project template fails to save",
  },
  saved: {
    defaultMessage: "Template saved",
    id: "jHX1Qm2V+z",
    description: "Toast after a project template is saved",
  },
  deleteFailed: {
    defaultMessage: "Couldn't delete the template.",
    id: "OrGcDJRddH",
    description: "Error when a project template fails to delete",
  },
  deleted: {
    defaultMessage: "Template deleted",
    id: "Ik7I5xaCpn",
    description: "Toast after a project template is deleted",
  },
});
