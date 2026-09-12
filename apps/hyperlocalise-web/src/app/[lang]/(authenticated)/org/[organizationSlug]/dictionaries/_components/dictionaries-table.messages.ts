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
    id: "g4P8nT2wK6",
    description: "Accessible label for the dictionaries list section",
  },
  loading: {
    defaultMessage: "Loading dictionaries…",
    id: "r9H3cL7sM1",
    description: "Loading state for the dictionaries list",
  },
  loadFailed: {
    defaultMessage: "Dictionaries failed to load.",
    id: "x2V6bQ5nD8",
    description: "Error state title for the dictionaries list",
  },
  wordCount: {
    defaultMessage: "{count, plural, one {# word} other {# words}}",
    id: "m5K1yF8tP3",
    description: "Word count shown on a dictionary list row",
  },
  statusActive: {
    defaultMessage: "Active",
    id: "c8W4hN2qL7",
    description: "Active status badge on a dictionary list row",
  },
  statusDraft: {
    defaultMessage: "Draft",
    id: "a3T7pJ9sR4",
    description: "Draft status badge on a dictionary list row",
  },
  statusArchived: {
    defaultMessage: "Archived",
    id: "l6D9vB1kH5",
    description: "Archived status badge on a dictionary list row",
  },
});
