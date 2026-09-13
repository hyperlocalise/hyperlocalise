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
    id: "3rnrMtcabi",
    description: "Eyebrow label above the dictionaries page title",
  },
  pageTitle: {
    defaultMessage: "Dictionaries",
    id: "iM7becse+M",
    description: "Dictionaries page heading",
  },
  pageDescription: {
    defaultMessage:
      "Allow-lists of brand names and product terms that Hunspell should skip. Attach a library to the projects that should use it.",
    id: "SWRB7SO8Wa",
    description: "Dictionaries page description under the heading",
  },
  dictionaryCount: {
    defaultMessage: "{count, plural, one {# dictionary} other {# dictionaries}}",
    id: "e3gMYEHqTG",
    description: "Status label showing how many dictionaries exist",
  },
  createDictionary: {
    defaultMessage: "Create dictionary",
    id: "RO+J5AxicZ",
    description: "Button to open the create dictionary dialog",
  },
  searchLabel: {
    defaultMessage: "Search",
    id: "MBAnxHf7Pt",
    description: "Label for the dictionaries search field",
  },
  searchPlaceholder: {
    defaultMessage: "Name or description…",
    id: "oVzysPDtoF",
    description: "Placeholder for the dictionaries search field",
  },
  emptyTitle: {
    defaultMessage: "No dictionaries yet",
    id: "oVyi1aG9vy",
    description: "Empty state title when the workspace has no dictionaries",
  },
  emptyDescription: {
    defaultMessage:
      "Create a library of accepted words, then attach it to projects so CAT and hl check skip those tokens.",
    id: "krFfWnDVQ0",
    description: "Empty state description for dictionaries",
  },
  noFilterMatches: {
    defaultMessage: "No dictionaries match your search.",
    id: "CCFKG/rZtI",
    description: "Empty search state for dictionaries",
  },
  createDialogTitle: {
    defaultMessage: "Create dictionary",
    id: "c9KWRTrOE6",
    description: "Title of the create dictionary dialog",
  },
  createDialogDescription: {
    defaultMessage: "Add a workspace allow-list. You can import words and attach projects next.",
    id: "KWq7zvli4J",
    description: "Description of the create dictionary dialog",
  },
  nameLabel: {
    defaultMessage: "Name",
    id: "qpxWkOMxRR",
    description: "Label for the dictionary name field",
  },
  namePlaceholder: {
    defaultMessage: "Brand names",
    id: "EXWlp7uxHf",
    description: "Placeholder for the dictionary name field",
  },
  descriptionLabel: {
    defaultMessage: "Description",
    id: "+UUE3IbCPl",
    description: "Label for the dictionary description field",
  },
  descriptionPlaceholder: {
    defaultMessage: "Where this allow-list should be used",
    id: "cQvwtUnUUI",
    description: "Placeholder for the dictionary description field",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "XYM25HOnOc",
    description: "Cancel button in the create dictionary dialog",
  },
  loadMore: {
    defaultMessage: "Load more",
    id: "+cStTc5glb",
    description: "Button to load the next page of dictionaries",
  },
});
