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

export const guidelinesEmptyStateMessages = defineMessages({
  title: {
    defaultMessage: "Check copy against your brand guidelines",
    id: "QBpmy570TT",
    description: "Title of the explainer shown when the workspace has no guideline documents",
  },
  description: {
    defaultMessage:
      "Upload your brand book or style guide, and Hyperlocalise checks copy against its rules for tone, wording and formatting.",
    id: "CCiH40Nrby",
    description: "Description of the explainer shown when the workspace has no guideline documents",
  },
  feature1Title: {
    defaultMessage: "Use the documents you already have",
    id: "rdIkJ5y8Nk",
    description: "Title of the first point in the empty guidelines explainer",
  },
  feature1Description: {
    defaultMessage: "Upload a PDF, Word, Markdown or text file, or write the rules yourself.",
    id: "F7/Mus/ejX",
    description: "Description of the first point in the empty guidelines explainer",
  },
  feature2Title: {
    defaultMessage: "Copy checked against every rule",
    id: "SO8brrWLCG",
    description: "Title of the second point in the empty guidelines explainer",
  },
  feature2Description: {
    defaultMessage:
      "Hyperlocalise agents flag copy that doesn't follow the guidelines, and say which rule it breaks.",
    id: "OhR/3nyLW+",
    description: "Description of the second point in the empty guidelines explainer",
  },
  feature3Title: {
    defaultMessage: "For the workspace or one project",
    id: "+iCRH/PBGj",
    description: "Title of the third point in the empty guidelines explainer",
  },
  feature3Description: {
    defaultMessage: "Apply a guideline to every project, or only to the ones it is written for.",
    id: "IJZDgn/F0O",
    description: "Description of the third point in the empty guidelines explainer",
  },
  action: {
    defaultMessage: "Upload guideline",
    id: "PpVY0LM6FZ",
    description: "Button in the empty guidelines explainer that opens the guideline upload page",
  },
});
