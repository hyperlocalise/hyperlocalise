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

export const dictionariesTableMessages = defineMessages({
  sectionLabel: {
    defaultMessage: "Dictionaries",
    id: "7GK/dF2FBE",
    description: "Accessible label for the dictionaries list section",
  },
  loading: {
    defaultMessage: "Loading dictionaries…",
    id: "fLQRsd7VZi",
    description: "Loading state for the dictionaries list",
  },
  loadFailed: {
    defaultMessage: "Dictionaries failed to load.",
    id: "usgRKcSksP",
    description: "Error state title for the dictionaries list",
  },
  wordCount: {
    defaultMessage: "{count, plural, one {# word} other {# words}}",
    id: "PDmh4fb8z6",
    description: "Word count shown on a dictionary list row",
  },
  statusActive: {
    defaultMessage: "Active",
    id: "47f6OyGEXm",
    description: "Active status badge on a dictionary list row",
  },
  statusDraft: {
    defaultMessage: "Draft",
    id: "w+Jj5ecAvo",
    description: "Draft status badge on a dictionary list row",
  },
  statusArchived: {
    defaultMessage: "Archived",
    id: "moK8z7fM5R",
    description: "Archived status badge on a dictionary list row",
  },
});
