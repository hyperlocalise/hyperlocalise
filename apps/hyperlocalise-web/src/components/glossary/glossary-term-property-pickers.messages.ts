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

export const glossaryTermPropertyPickersMessages = defineMessages({
  partOfSpeechLabel: {
    defaultMessage: "Part of speech",
    id: "r1aEK84u1V",
    description: "Label for the part of speech field on a glossary term form",
  },
  partOfSpeechSearchPlaceholder: {
    defaultMessage: "Search part of speech...",
    id: "wsUFAfa8Hd",
    description: "Search placeholder for the part of speech picker",
  },
  partOfSpeechNoMatches: {
    defaultMessage: "No categories found.",
    id: "CCHRUS19n3",
    description: "Empty search result in the part of speech picker",
  },
  termTypeFullFormDescription: {
    defaultMessage: "Complete form of a term",
    id: "F+qlLuaEi6",
    description: "Description for the full form term type",
  },
  termTypeAcronymDescription: {
    defaultMessage: "Initials pronounced as a word",
    id: "OMHukdK6Wt",
    description: "Description for the acronym term type",
  },
  termTypeAbbreviationDescription: {
    defaultMessage: "Shortened written form",
    id: "r7qqla56RV",
    description: "Description for the abbreviation term type",
  },
  termTypeShortFormDescription: {
    defaultMessage: "Informal shortened name",
    id: "04/aNgNk5U",
    description: "Description for the short form term type",
  },
  termTypePhraseDescription: {
    defaultMessage: "Multi-word expression",
    id: "kDMX9jypDk",
    description: "Description for the phrase term type",
  },
  termTypeVariantDescription: {
    defaultMessage: "Alternative form",
    id: "3s0Ll5QBJY",
    description: "Description for the variant term type",
  },
  genderLabel: {
    defaultMessage: "Gender",
    id: "YXXKbKuK0y",
    description: "Label for term gender metadata",
  },
  typeLabel: {
    defaultMessage: "Type",
    id: "ZeIi5DDF02",
    description: "Label for term type metadata",
  },
  statusLabel: {
    defaultMessage: "Status",
    id: "wMxGDB1lvE",
    description: "Label for term status metadata",
  },
  preferred: {
    defaultMessage: "Preferred",
    id: "nAOm8YPSCd",
    description: "Preferred native glossary term status",
  },
  draft: {
    defaultMessage: "Draft",
    id: "W8CHLNCqjs",
    description: "Draft native glossary term status",
  },
  notRecommended: {
    defaultMessage: "Not recommended",
    id: "tWfjSsUysY",
    description: "Not recommended native glossary term status",
  },
});
