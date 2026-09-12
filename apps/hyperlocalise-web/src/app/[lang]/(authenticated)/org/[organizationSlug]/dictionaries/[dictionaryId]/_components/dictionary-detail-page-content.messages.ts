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

export const dictionaryDetailMessages = defineMessages({
  loadFailed: {
    defaultMessage: "Failed to load this dictionary.",
    id: "q8N3wH5kL2",
    description: "Error when a dictionary detail page cannot load",
  },
  wordsTitle: {
    defaultMessage: "Accepted words",
    id: "s4T7cP1mR9",
    description: "Heading for the dictionary word list",
  },
  localeLabel: {
    defaultMessage: "Locale",
    id: "v2K6gD8nB4",
    description: "Label for the dictionary word locale field",
  },
  localePlaceholder: {
    defaultMessage: "en-US",
    id: "y9F3hJ5tW1",
    description: "Placeholder for the dictionary word locale field",
  },
  wordLabel: {
    defaultMessage: "Word",
    id: "b6M8pL2qX7",
    description: "Label for the dictionary word field",
  },
  addWord: {
    defaultMessage: "Add word",
    id: "e1C4rN9sH3",
    description: "Button to add a word to a dictionary",
  },
  importWords: {
    defaultMessage: "Import",
    id: "h7W2kT5vP8",
    description: "Button to import dictionary words from a text file",
  },
  exportWords: {
    defaultMessage: "Export",
    id: "k3Y8dB1gF6",
    description: "Button to export dictionary words for a locale",
  },
  deleteWord: {
    defaultMessage: "Remove",
    id: "n5Z1cM4jL9",
    description: "Button to remove a word from a dictionary",
  },
  emptyWords: {
    defaultMessage: "No words for this locale yet.",
    id: "p8A6tQ2wR5",
    description: "Empty state for a dictionary locale with no words",
  },
  projectsTitle: {
    defaultMessage: "Projects",
    id: "r2D7nK9sV4",
    description: "Heading for dictionary project attachments",
  },
  attachProject: {
    defaultMessage: "Attach",
    id: "t6G3bH8pC1",
    description: "Button to attach a dictionary to a selected project",
  },
  detachProject: {
    defaultMessage: "Detach",
    id: "w9J4fL1mN7",
    description: "Button to detach a dictionary from a project",
  },
  noProjects: {
    defaultMessage: "This dictionary is not attached to any projects.",
    id: "z4L8xP3qT2",
    description: "Empty state when a dictionary has no attached projects",
  },
  selectProject: {
    defaultMessage: "Select a project",
    id: "c7N2yR6kW5",
    description: "Placeholder for the attach-project selector",
  },
  addFailed: {
    defaultMessage: "Could not add that word.",
    id: "f1P5dT8hB3",
    description: "Error when adding a dictionary word fails",
  },
  importFailed: {
    defaultMessage: "Could not import those words.",
    id: "i8S3gV2nM6",
    description: "Error when importing dictionary words fails",
  },
  exportFailed: {
    defaultMessage: "Could not export words for this locale.",
    id: "l4U9kC7qH1",
    description: "Error when exporting dictionary words fails",
  },
  attachFailed: {
    defaultMessage: "Could not attach that project.",
    id: "o6X2mF5sJ8",
    description: "Error when attaching a dictionary to a project fails",
  },
  wordRequired: {
    defaultMessage: "Enter a single word with no spaces.",
    id: "q9Z5nB1wL4",
    description: "Validation error for an empty or invalid dictionary word",
  },
});
