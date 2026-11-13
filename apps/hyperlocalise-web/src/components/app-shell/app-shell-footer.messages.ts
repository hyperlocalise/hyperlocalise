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

export const appShellFooterMessages = defineMessages({
  emailSupportAriaLabel: {
    defaultMessage: "Email support",
    id: "ecG+jsddyC",
    description: "Accessible label for the support email button in the app shell footer",
  },
  glossaryGuidanceLoading: {
    defaultMessage: "Checking for glossary matches",
    id: "r2k+y+3lqI",
    description:
      "Screen reader text on the glossary guidance footer button while matches for the current string load",
  },
  glossaryGuidanceMatchCount: {
    defaultMessage: "{count, plural, one {# concept match} other {# concept matches}}",
    id: "JvhN7hS1FF",
    description:
      "Screen reader text for the glossary concept match count badge on the footer button",
  },
  glossaryGuidanceNotRecommendedCount: {
    defaultMessage: "{count, plural, one {# term not recommended} other {# terms not recommended}}",
    id: "rK7ozpqUVh",
    description:
      "Screen reader text for the badge counting not-recommended glossary terms in the current string",
  },
  glossaryGuidanceLabel: {
    defaultMessage: "Glossary guidance",
    id: "w7J+PHlma7",
    description: "Label for the glossary guidance button in the app shell footer",
  },
  issueGuidanceAriaLabel: {
    defaultMessage: "Open Queries",
    id: "LThxvPehnJ",
    description: "Accessible label for the Queries button in the app shell footer",
  },
  issueGuidanceAvailableAriaLabel: {
    defaultMessage: "Open Queries, {count} open",
    id: "21DxEHM2/g",
    description: "Accessible label for the Queries button when open issues are available",
  },
  issueGuidanceLabel: {
    defaultMessage: "Queries",
    id: "Y1cFr7sG1J",
    description: "Label for the Queries button in the app shell footer",
  },
  styleGuideAriaLabel: {
    defaultMessage: "Open style guide",
    id: "3MzWPxEFTr",
    description: "Accessible label for the style guide button in the app shell footer",
  },
  styleGuideLabel: {
    defaultMessage: "Style guide",
    id: "FK5XT+2lld",
    description: "Label for the style guide button in the app shell footer",
  },
  guidelineAriaLabel: {
    defaultMessage: "Open guideline",
    id: "+xROFO94L4",
    description: "Accessible label for the guideline button in the app shell footer",
  },
  guidelineLabel: {
    defaultMessage: "Guideline",
    id: "wufZJk5FA/",
    description: "Label for the guideline button in the app shell footer",
  },
  supportLabel: {
    defaultMessage: "Support",
    id: "VvLbwcYPHK",
    description: "Label for the support email button in the app shell footer",
  },
});
