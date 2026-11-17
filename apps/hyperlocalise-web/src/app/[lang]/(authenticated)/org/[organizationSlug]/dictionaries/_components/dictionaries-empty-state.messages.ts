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

export const dictionariesEmptyStateMessages = defineMessages({
  title: {
    defaultMessage: "Teach the spellchecker your words",
    id: "GKJvCVtk6h",
    description: "Title of the explainer shown when the workspace has no dictionaries",
  },
  description: {
    defaultMessage:
      "A dictionary lists words that are spelled right even though a spellchecker doesn't know them, like product names and industry terms.",
    id: "mexdjc29oj",
    description: "Description of the explainer shown when the workspace has no dictionaries",
  },
  feature1Title: {
    defaultMessage: "Stop false typos",
    id: "fWm2g5E0Wa",
    description: "Title of the first point in the empty dictionaries explainer",
  },
  feature1Description: {
    defaultMessage: "Allowed words are no longer flagged in the CAT editor or by hl check.",
    id: "QJbQ5MPyac",
    description: "Description of the first point in the empty dictionaries explainer",
  },
  feature2Title: {
    defaultMessage: "Real mistakes stand out",
    id: "317/PA3S/I",
    description: "Title of the second point in the empty dictionaries explainer",
  },
  feature2Description: {
    defaultMessage: "With the noise gone, reviewers only see the words that need fixing.",
    id: "hXea3UMGXu",
    description: "Description of the second point in the empty dictionaries explainer",
  },
  feature3Title: {
    defaultMessage: "Per language, per project",
    id: "8i+O5TwyL5",
    description: "Title of the third point in the empty dictionaries explainer",
  },
  feature3Description: {
    defaultMessage:
      "Keep a word list for each language and attach the dictionary to the projects that need it.",
    id: "8mBZXmq4w/",
    description: "Description of the third point in the empty dictionaries explainer",
  },
});
