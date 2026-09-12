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
    id: "uKarjEkmmM",
    description: "Error when a dictionary detail page cannot load",
  },
  wordsTitle: {
    defaultMessage: "Accepted words",
    id: "EWqf+wk5hx",
    description: "Heading for the dictionary word list",
  },
  localeLabel: {
    defaultMessage: "Locale",
    id: "XqqfNoZo8g",
    description: "Label for the dictionary word locale field",
  },
  localePlaceholder: {
    defaultMessage: "en-US",
    id: "Y01+ehgMD/",
    description: "Placeholder for the dictionary word locale field",
  },
  wordLabel: {
    defaultMessage: "Word",
    id: "jCG2fHTnxO",
    description: "Label for the dictionary word field",
  },
  addWord: {
    defaultMessage: "Add word",
    id: "hT8TORYOoH",
    description: "Button to add a word to a dictionary",
  },
  importWords: {
    defaultMessage: "Import",
    id: "pHj5D5hJU+",
    description: "Button to import dictionary words from a text file",
  },
  exportWords: {
    defaultMessage: "Export",
    id: "+sdjaNzt1g",
    description: "Button to export dictionary words for a locale",
  },
  deleteWord: {
    defaultMessage: "Remove",
    id: "2Eln7MuWtc",
    description: "Button to remove a word from a dictionary",
  },
  emptyWords: {
    defaultMessage: "No words for this locale yet.",
    id: "bsA+uhksQg",
    description: "Empty state for a dictionary locale with no words",
  },
  projectsTitle: {
    defaultMessage: "Projects",
    id: "eRLGmAlreB",
    description: "Heading for dictionary project attachments",
  },
  attachProject: {
    defaultMessage: "Attach",
    id: "oVeMCbk8kZ",
    description: "Button to attach a dictionary to a selected project",
  },
  detachProject: {
    defaultMessage: "Detach",
    id: "x3iRklyWjn",
    description: "Button to detach a dictionary from a project",
  },
  noProjects: {
    defaultMessage: "This dictionary is not attached to any projects.",
    id: "LYdhfNsW7N",
    description: "Empty state when a dictionary has no attached projects",
  },
  selectProject: {
    defaultMessage: "Select a project",
    id: "GPiuIeFZ32",
    description: "Placeholder for the attach-project selector",
  },
  addFailed: {
    defaultMessage: "Could not add that word.",
    id: "yMNDubivS/",
    description: "Error when adding a dictionary word fails",
  },
  importFailed: {
    defaultMessage: "Could not import those words.",
    id: "ssxhSeQ+xO",
    description: "Error when importing dictionary words fails",
  },
  exportFailed: {
    defaultMessage: "Could not export words for this locale.",
    id: "V21lzZzbHn",
    description: "Error when exporting dictionary words fails",
  },
  attachFailed: {
    defaultMessage: "Could not attach that project.",
    id: "uFYNRK7fNC",
    description: "Error when attaching a dictionary to a project fails",
  },
  wordRequired: {
    defaultMessage: "Enter a single word with no spaces.",
    id: "HnQHQaB8I0",
    description: "Validation error for an empty or invalid dictionary word",
  },
});
