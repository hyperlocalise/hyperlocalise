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

export const dictionariesPageViewMessages = defineMessages({
  pageLabel: {
    defaultMessage: "Workspace",
    id: "q2L9tH5nR8",
    description: "Eyebrow label above the dictionaries page title",
  },
  pageTitle: {
    defaultMessage: "Dictionaries",
    id: "s7M4wP1kD3",
    description: "Dictionaries page heading",
  },
  pageDescription: {
    defaultMessage:
      "Allow-lists of brand names and product terms that Hunspell should skip. Attach a library to the projects that should use it.",
    id: "f5C8yB2vN6",
    description: "Dictionaries page description under the heading",
  },
  dictionaryCount: {
    defaultMessage: "{count, plural, one {# dictionary} other {# dictionaries}}",
    id: "z1K6gT9xW4",
    description: "Status label showing how many dictionaries exist",
  },
  createDictionary: {
    defaultMessage: "Create dictionary",
    id: "h8P3nL2qM7",
    description: "Button to open the create dictionary dialog",
  },
  searchLabel: {
    defaultMessage: "Search",
    id: "a4R7cJ5bE9",
    description: "Label for the dictionaries search field",
  },
  searchPlaceholder: {
    defaultMessage: "Name or description…",
    id: "u9T2mV6sH1",
    description: "Placeholder for the dictionaries search field",
  },
  emptyTitle: {
    defaultMessage: "No dictionaries yet",
    id: "c3W8pK4nL5",
    description: "Empty state title when the workspace has no dictionaries",
  },
  emptyDescription: {
    defaultMessage:
      "Create a library of accepted words, then attach it to projects so CAT and hl check skip those tokens.",
    id: "e6Y1dN8qR2",
    description: "Empty state description for dictionaries",
  },
  noFilterMatches: {
    defaultMessage: "No dictionaries match your search.",
    id: "j7B5xF3tP0",
    description: "Empty search state for dictionaries",
  },
  createDialogTitle: {
    defaultMessage: "Create dictionary",
    id: "k2H9sL6wQ4",
    description: "Title of the create dictionary dialog",
  },
  createDialogDescription: {
    defaultMessage: "Add a workspace allow-list. You can import words and attach projects next.",
    id: "n5M8vC1gT7",
    description: "Description of the create dictionary dialog",
  },
  nameLabel: {
    defaultMessage: "Name",
    id: "p4D7rY2kJ8",
    description: "Label for the dictionary name field",
  },
  namePlaceholder: {
    defaultMessage: "Brand names",
    id: "t8G3bW5nA6",
    description: "Placeholder for the dictionary name field",
  },
  descriptionLabel: {
    defaultMessage: "Description",
    id: "w1X6hP9sL3",
    description: "Label for the dictionary description field",
  },
  descriptionPlaceholder: {
    defaultMessage: "Where this allow-list should be used",
    id: "y3Z8cK2mV5",
    description: "Placeholder for the dictionary description field",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "b7N4qF1dR9",
    description: "Cancel button in the create dictionary dialog",
  },
});
