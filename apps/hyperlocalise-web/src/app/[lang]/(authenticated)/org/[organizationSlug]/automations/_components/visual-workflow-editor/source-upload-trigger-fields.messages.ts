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

export const sourceUploadTriggerFieldsMessages = defineMessages({
  uploadsLabel: {
    defaultMessage: "Run on",
    id: "oGG66eAqv0",
    description: "Label of the choice of which uploads start a Source upload workflow",
  },
  uploadsNewAndUpdated: {
    defaultMessage: "New and updated files",
    id: "MTUXy1sXU0",
    description: "Source upload trigger option: every upload, including a new version of a file",
  },
  uploadsNewOnly: {
    defaultMessage: "New files only",
    id: "4eJBjHNeVu",
    description: "Source upload trigger option: only files uploaded for the first time",
  },
  filterLabel: {
    defaultMessage: "Only files matching",
    id: "E9wwHtcU9r",
    description: "Label of the list of path patterns that limit which files start the workflow",
  },
  filterEmptyHint: {
    defaultMessage: "Every file starts the workflow. Add a pattern to run only for some files.",
    id: "l+ic10z8k+",
    description: "Shown under the path filter while it has no patterns",
  },
  globHint: {
    defaultMessage:
      "* matches within a folder, ** across folders, and '{a,b}' either one. A pattern without a / matches the file name in any folder.",
    id: "GTuqE3OpBf",
    description: "How glob patterns work, under the Source upload path filter",
  },
  regexHint: {
    defaultMessage:
      "A regular expression tested against the whole path, ignoring case, such as ^locales/en/.*\\.json$.",
    id: "pgWGvAMQcI",
    description: "How regex patterns work, under the Source upload path filter",
  },
  syntaxGlob: {
    defaultMessage: "Glob",
    id: "kcrePkUiva",
    description: "Path filter syntax option: glob patterns such as **/*.json",
  },
  syntaxRegex: {
    defaultMessage: "Regex",
    id: "xiRC52jGRm",
    description: "Path filter syntax option: regular expressions",
  },
  syntaxLabel: {
    defaultMessage: "Pattern syntax",
    id: "XeUhOWspWv",
    description: "Accessible label of the glob or regex switch on the path filter",
  },
  patternLabel: {
    defaultMessage: "Pattern {number}",
    id: "uST5+aAtqk",
    description: "Accessible label of one path pattern box; number counts from 1",
  },
  removePattern: {
    defaultMessage: "Remove pattern {number}",
    id: "KVnvqKVdu/",
    description: "Accessible label of the button that removes one path pattern",
  },
  addPattern: {
    defaultMessage: "Add pattern",
    id: "8O+tkwHLGv",
    description: "Button that adds an empty path pattern to the Source upload filter",
  },
  examplesLabel: {
    defaultMessage: "Examples",
    id: "jz4GTlYvSI",
    description: "Label before example path patterns a person can click to add",
  },
  addExample: {
    defaultMessage: "Add {pattern}",
    id: "f0CobpM34f",
    description: "Accessible label of an example path pattern button",
  },
  patternEmpty: {
    defaultMessage: "Type a pattern or remove this row.",
    id: "9A04YV3x5z",
    description: "Error under an empty path pattern",
  },
  patternTooLong: {
    defaultMessage: "Keep a pattern under 200 characters.",
    id: "pjYA9ErMWK",
    description: "Error under a path pattern that is too long",
  },
  patternInvalid: {
    defaultMessage: "This is not a valid pattern.",
    id: "VaITe7E6yo",
    description: "Error under a path pattern that cannot be read",
  },
  patternUnsafe: {
    defaultMessage:
      "A repeated group that repeats again, such as (a+)+, can be very slow. Write it without the nested repeat.",
    id: "/d6o8nwZbo",
    description: "Error under a regular expression with a nested quantifier",
  },
  testLabel: {
    defaultMessage: "Try a path",
    id: "LC11FQ5Dwr",
    description: "Label of the box where a person types a file path to see whether it matches",
  },
  testMatches: {
    defaultMessage: "Starts the workflow",
    id: "A+CpdMTX/N",
    description: "Result when the tried path matches the Source upload filter",
  },
  testSkipped: {
    defaultMessage: "Skipped: no pattern matches",
    id: "KnE38OJSY5",
    description: "Result when the tried path matches none of the Source upload patterns",
  },
});
