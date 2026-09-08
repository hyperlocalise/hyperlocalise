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

export const projectLocaleProgressListMessages = defineMessages({
  title: {
    defaultMessage: "Languages",
    id: "zNif9FKga+",
    description: "Heading for the project locale translation progress list",
  },
  searchPlaceholder: {
    defaultMessage: "Search languages",
    id: "NP4duQIbJD",
    description: "Placeholder for filtering project locales by name or code",
  },
  sortAz: {
    defaultMessage: "A–Z",
    id: "NtrP9v6nQ4",
    description: "Button label to sort locales alphabetically",
  },
  sortZa: {
    defaultMessage: "Z–A",
    id: "cpSIo6rBul",
    description: "Button label to sort locales in reverse alphabetical order",
  },
  wordsTab: {
    defaultMessage: "Words",
    id: "TIlDexJ1Y8",
    description: "Tab showing word-based translation progress",
  },
  stringsTab: {
    defaultMessage: "Strings",
    id: "yRuWK+QTKd",
    description: "Tab showing string-based translation progress",
  },
  totalWords: {
    defaultMessage:
      "{count, plural, one {# translatable word in total} other {# translatable words in total}}",
    id: "BGZhnA5Bkq",
    description: "Total translatable word count in an expanded locale row",
  },
  totalStrings: {
    defaultMessage:
      "{count, plural, one {# translatable string in total} other {# translatable strings in total}}",
    id: "93i6HvwXyA",
    description: "Total translatable string count in an expanded locale row",
  },
  remainingWords: {
    defaultMessage: "{count, plural, one {# word} other {# words}}",
    id: "6SHDHgWJLa",
    description: "Remaining untranslated word count on a collapsed locale row",
  },
  remainingStrings: {
    defaultMessage: "{count, plural, one {# string} other {# strings}}",
    id: "hL0sGC6Xoj",
    description: "Remaining untranslated string count on a collapsed locale row",
  },
  translated: {
    defaultMessage: "Translated",
    id: "igKhQOsrv+",
    description: "Progress table row label for translated work",
  },
  approved: {
    defaultMessage: "Approved",
    id: "CbuvPB6HCw",
    description: "Progress table row label for approved work",
  },
  todo: {
    defaultMessage: "Todo",
    id: "/yrnrzsaf9",
    description: "Column heading for remaining work in the locale progress table",
  },
  done: {
    defaultMessage: "Done",
    id: "i29Xh/8PGM",
    description: "Column heading for completed work in the locale progress table",
  },
  lastActivity: {
    defaultMessage: "Last activity {when}",
    id: "RWUw6HKSvD",
    description: "Relative timestamp of the latest translation activity for a locale",
  },
  lastActivityNever: {
    defaultMessage: "No activity yet",
    id: "QVvwDJw1I3",
    description: "Shown when a locale has no translation updates",
  },
  translate: {
    defaultMessage: "Translate",
    id: "4ipjfzP7qr",
    description: "Link from a locale row into the content editor untranslated queue",
  },
  proofread: {
    defaultMessage: "Proofread",
    id: "lsmpBVLKpZ",
    description: "Link from a locale row into the content editor review queue",
  },
  expand: {
    defaultMessage: "Show {locale} details",
    id: "iDOdRMXYSX",
    description: "Accessible label to expand a locale progress row",
  },
  collapse: {
    defaultMessage: "Hide {locale} details",
    id: "fEqp3yJRPt",
    description: "Accessible label to collapse a locale progress row",
  },
  progressLabel: {
    defaultMessage: "{locale} translation progress",
    id: "BkbHzcKWkt",
    description: "Accessible label for a locale translation progress bar",
  },
  emptyTitle: {
    defaultMessage: "No target languages yet",
    id: "tbWhMwM8OM",
    description: "Empty-state title when a project has no target locales",
  },
  emptyDescription: {
    defaultMessage: "Add target languages in settings to track translation progress here.",
    id: "ZOC86/UJbR",
    description: "Empty-state description when a project has no target locales",
  },
  noSearchResults: {
    defaultMessage: "No languages match “{query}”.",
    id: "a3n8jBbMmU",
    description: "Shown when locale search filters out every row",
  },
  loadError: {
    defaultMessage: "Unable to load language progress.",
    id: "oFoqUqR3xA",
    description: "Error message when locale progress fails to load",
  },
  translationPercent: {
    defaultMessage: "{percent}%",
    id: "mGQ8u5Lds5",
    description: "Translated percent shown on a locale progress row",
  },
  approvalPercent: {
    defaultMessage: "{percent}%",
    id: "zCQhaHX3Xw",
    description: "Approved percent shown on a locale progress row",
  },
  viewSettings: {
    defaultMessage: "View settings",
    id: "t7VshKcR+p",
    description: "Link to project settings from the empty locale progress state",
  },
});
