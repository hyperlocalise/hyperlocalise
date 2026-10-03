"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const groupMessages = defineMessages({
  view: {
    id: "AMsokTw7BJ",
    defaultMessage: "String view",
    description: "Editor string grouping view label",
  },
  individual: {
    id: "MWGQAGG98v",
    defaultMessage: "Individual strings",
    description: "Individual string view option",
  },
  grouped: {
    id: "6r2HnqYZDl",
    defaultMessage: "Group identical strings",
    description: "Grouped string view option",
  },
  projectDefault: {
    id: "SJA7gyKsZV",
    defaultMessage: "Use project default",
    description: "Reset personal grouping preference",
  },
  search: {
    id: "2Yr5x4orOZ",
    defaultMessage: "Search strings",
    description: "Search grouped strings",
  },
  filter: {
    id: "NddCHN7i2h",
    defaultMessage: "Filter strings",
    description: "Grouped string filter label",
  },
  all: { id: "ny1oD2i/fr", defaultMessage: "All strings", description: "All strings filter" },
  untranslated: {
    id: "lE3VKojvhr",
    defaultMessage: "Untranslated",
    description: "Untranslated member filter",
  },
  needs_review: {
    id: "dN16cmxYfD",
    defaultMessage: "Needs review",
    description: "Needs review filter",
  },
  reviewed: {
    id: "9usKQl0Wfi",
    defaultMessage: "Approved",
    description: "Approved member filter",
  },
  has_issues: {
    id: "NwDlkHDtzn",
    defaultMessage: "Has issues",
    description: "Issue member filter",
  },
  hidden: {
    id: "JuGU2af+p6",
    defaultMessage: "Hidden",
    description: "Hidden member badge or filter",
  },
  locked: { id: "P54Wzfa5O5", defaultMessage: "Locked", description: "Locked member badge" },
  draft: { id: "1aPnR9Wplg", defaultMessage: "Draft", description: "Draft translation status" },
  rejected: {
    id: "P2BhUXKrFa",
    defaultMessage: "Rejected",
    description: "Rejected translation status",
  },
  occurrences: {
    id: "tty9Qguyd5",
    defaultMessage: "{count, plural, one {# occurrence} other {# occurrences}}",
    description: "Number of identical source occurrences",
  },
  matching: {
    id: "QBbD5GiiB7",
    defaultMessage: "{count} match this filter",
    description: "Matching group occurrences",
  },
  mixed: {
    id: "su/vlEplFz",
    defaultMessage: "Multiple translations",
    description: "Different translations in one group",
  },
  progress: {
    id: "QG/dB0EJpO",
    defaultMessage: "{translated} translated · {approved} approved · {locked} locked",
    description: "Group member status counts",
  },
  previous: { id: "L2mKI6RmBY", defaultMessage: "Previous", description: "Previous page" },
  next: { id: "2Riv0UFuRU", defaultMessage: "Next", description: "Next page" },
  page: {
    id: "i+OfeFO55S",
    defaultMessage: "{start}–{end} of {total}",
    description: "Pagination range",
  },
  error: {
    id: "yhKgwi97Xc",
    defaultMessage: "Could not load strings.",
    description: "Group loading error",
  },
  retry: {
    id: "vFR3uUyEFs",
    defaultMessage: "Retry",
    description: "Retry loading groups or members",
  },
  empty: {
    id: "yBInAgw1Fg",
    defaultMessage: "No strings match this view.",
    description: "Empty grouped browser",
  },
  clear: {
    id: "2pAv80s67m",
    defaultMessage: "Clear filters",
    description: "Clear group search and filters",
  },
  select: {
    id: "V1bfLcNS6g",
    defaultMessage: "Select a source string to inspect its occurrences.",
    description: "Empty member inspection prompt",
  },
  members: {
    id: "KZvqtpb7lA",
    defaultMessage: "Occurrences",
    description: "Group members heading",
  },
  outsideFilter: {
    id: "sQ4Po+Dp6H",
    defaultMessage: "Outside current filter",
    description: "Member does not match active filter",
  },
  maxLength: {
    id: "XNrp8+0nm5",
    defaultMessage: "Maximum length: {count}",
    description: "Member length constraint",
  },
  readOnly: {
    id: "WbAkw38l3W",
    defaultMessage: "Inspect occurrences here. Switch to individual strings to edit a translation.",
    description: "Grouped browser read-only hint",
  },
  loading: {
    id: "xXB6cmih1q",
    defaultMessage: "Loading strings",
    description: "Loading grouped strings",
  },
});
