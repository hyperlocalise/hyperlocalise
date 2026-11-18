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

export const sampleWorkspaceSectionMessages = defineMessages({
  title: {
    defaultMessage: "Sample data",
    id: "OvonIo9cAp",
    description: "Heading of the sample data card on workspace general settings",
  },
  description: {
    defaultMessage:
      "Load a fictional brand with projects, source files, translations, a glossary, a translation memory, a spellcheck dictionary and guidelines, so you can explore Hyperlocalise before adding your own content.",
    id: "IWEp9eHVK0",
    description: "Explains what loading sample data adds to the workspace",
  },
  loadedDescription: {
    defaultMessage:
      "Sample data is loaded. Remove it when you're ready to work with your own content.",
    id: "Km9EKf4Txo",
    description: "Shown on the sample data card when sample data is already in the workspace",
  },
  loadButton: {
    defaultMessage: "Load sample data",
    id: "08o43HFYsk",
    description: "Button that creates sample projects, glossary and other resources",
  },
  loadingButton: {
    defaultMessage: "Loading sample data…",
    id: "CK/cgWmupI",
    description: "Button label while sample data is being created",
  },
  removeButton: {
    defaultMessage: "Remove sample data",
    id: "thEFPkPaJE",
    description: "Button that deletes the sample projects and resources",
  },
  openProject: {
    defaultMessage: "Open {projectName}",
    id: "p35PLT2z7X",
    description: "Link to a sample project after sample data has loaded",
  },
  stepProjects: {
    defaultMessage: "Projects, source files and translations",
    id: "0I/Aupkz6X",
    description: "Sample data step: creating projects with files and translations",
  },
  stepKnowledge: {
    defaultMessage: "Glossary, translation memory and spellcheck dictionary",
    id: "FSMJb5OB4b",
    description: "Sample data step: creating glossary, translation memory and dictionary",
  },
  stepGuidelines: {
    defaultMessage: "Guideline documents",
    id: "7Ky/uD32i8",
    description: "Sample data step: uploading guideline documents",
  },
  stepSkipped: {
    defaultMessage: "Skipped",
    id: "7/ImBfxqFe",
    description:
      "Badge on a sample data step that could not run, such as guidelines on a plan without them",
  },
  loadedToast: {
    defaultMessage: "Sample data loaded",
    id: "AwjpUt/AOn",
    description: "Success toast after sample data has been created",
  },
  loadFailed: {
    defaultMessage: "Couldn't load sample data",
    id: "BNTnpFca07",
    description: "Fallback error when creating sample data fails",
  },
  statusFailed: {
    defaultMessage: "Couldn't check for sample data",
    id: "rmRbS0GoNu",
    description: "Error when reading whether sample data is loaded fails",
  },
  removedToast: {
    defaultMessage: "Sample data removed",
    id: "wv0BYwWOsy",
    description: "Success toast after sample data has been deleted",
  },
  removeFailed: {
    defaultMessage: "Couldn't remove sample data",
    id: "nNe67OGUqJ",
    description: "Fallback error when deleting sample data fails",
  },
  removeDialogTitle: {
    defaultMessage: "Remove sample data?",
    id: "X6eIVuAlLK",
    description: "Title of the confirmation dialog before deleting sample data",
  },
  removeDialogDescription: {
    defaultMessage:
      "This deletes the sample projects with their files and translations, and the sample glossary, translation memory, dictionary and guidelines. Your own content is not affected.",
    id: "3A4mHcnJtI",
    description: "Body of the confirmation dialog before deleting sample data",
  },
  removeDialogCancel: {
    defaultMessage: "Cancel",
    id: "IBziNWxnaJ",
    description: "Cancel button in the remove sample data dialog",
  },
  removeDialogConfirm: {
    defaultMessage: "Remove",
    id: "6RUqnJxznS",
    description: "Confirm button in the remove sample data dialog",
  },
});
