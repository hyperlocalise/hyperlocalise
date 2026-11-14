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
  backToDictionaries: {
    defaultMessage: "Dictionaries",
    id: "BfRP/nBJGO",
    description: "Back link from dictionary detail to the list page",
  },
  descriptionFallback: {
    defaultMessage:
      "Words listed here are skipped by spellcheck in the projects that use this dictionary.",
    id: "vQbuGXT3Ma",
    description: "Fallback description when a dictionary has no description",
  },
  wordCount: {
    defaultMessage: "{count, plural, one {# word} other {# words}} in all locales",
    id: "KPr0MyCK2+",
    description: "Badge showing total words across locales",
  },
  localeWordCount: {
    defaultMessage: "{count, plural, one {# word} other {# words}} in {locale}",
    id: "RKHJ/olpXP",
    description: "Count of accepted words for the selected locale",
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
  wordPlaceholder: {
    defaultMessage: "Add an accepted word",
    id: "mIfS2KCWEo",
    description: "Placeholder for the dictionary word field",
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
    defaultMessage: "Remove {word}",
    id: "Xl8JhoJHYV",
    description: "Accessible label to remove a word from a dictionary",
  },
  emptyWords: {
    defaultMessage: "No words for {locale} yet. Add one above or import a .txt file.",
    id: "AuYw3s9yoM",
    description: "Empty state for a dictionary locale with no words",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "aONT/Ovdyv",
    description: "Button to load the next page of dictionary words",
  },
  usedInLabel: {
    defaultMessage: "Used in",
    id: "x5yxBL3DUW",
    description: "Label for projects that use this dictionary",
  },
  assignProject: {
    defaultMessage: "Assign project",
    id: "Ief3/fvC7r",
    description: "Button to assign a dictionary to a project",
  },
  removeProject: {
    defaultMessage: "Remove {name}",
    id: "Y3oa11bv9U",
    description: "Accessible label to remove a project from a dictionary",
  },
  emptyProjects: {
    defaultMessage: "No projects yet",
    id: "NWpOs8l31w",
    description: "Empty state when a dictionary has no attached projects",
  },
  noAssignableProjects: {
    defaultMessage: "No other projects to assign.",
    id: "m4SFetgyeJ",
    description: "Empty assign-project menu when every project is already attached",
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
