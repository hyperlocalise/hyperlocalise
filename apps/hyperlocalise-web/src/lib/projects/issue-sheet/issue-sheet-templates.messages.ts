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

// Each *Heading* message is one markdown heading in a template's prefilled description skeleton
// (see issueSheetTemplateSkeleton in issue-sheet-templates.ts, which composes them). Headings
// only, no prose hints, because a hint line is non-empty content and stripEmptySections (which
// drops unfilled sections on submit) only removes headings with nothing under them. None of these
// ask for something the create form already captures as a field (locale, source path, priority,
// assignee, link, custom columns). This is the "requests only relevant evidence" acceptance
// criterion.
export const issueSheetTemplateMessages = defineMessages({
  noTemplateLabel: {
    defaultMessage: "No template",
    id: "yUJq1o3T8y",
    description: "Label for clearing the issue template selection in the create issue dialog",
  },

  translationMistakeLabel: {
    defaultMessage: "Translation mistake",
    id: "B8H5qyHiWy",
    description: "Label for the translation mistake issue template",
  },
  translationMistakeHeadingCurrent: {
    defaultMessage: "Current translation",
    id: "WIwcX3Fw30",
    description: "Description skeleton heading for the translation mistake issue template",
  },
  translationMistakeHeadingSuggested: {
    defaultMessage: "Suggested correction",
    id: "+y1tBCWC43",
    description: "Description skeleton heading for the translation mistake issue template",
  },
  translationMistakeHeadingWhatIsWrong: {
    defaultMessage: "What is wrong (meaning, tone, grammar, or style)",
    id: "UE1Umv7eEm",
    description: "Description skeleton heading for the translation mistake issue template",
  },

  sourceMistakeLabel: {
    defaultMessage: "Source mistake",
    id: "m2LULYgKKY",
    description: "Label for the source mistake issue template",
  },
  sourceMistakeHeadingSourceText: {
    defaultMessage: "Source text as written",
    id: "Cpqhu+50JL",
    description: "Description skeleton heading for the source mistake issue template",
  },
  sourceMistakeHeadingWhatIsWrong: {
    defaultMessage: "What is wrong with it",
    id: "LNnC/DWQXp",
    description: "Description skeleton heading for the source mistake issue template",
  },
  sourceMistakeHeadingSuggestedCorrection: {
    defaultMessage: "Suggested source correction",
    id: "HEmDtrKdrX",
    description: "Description skeleton heading for the source mistake issue template",
  },
  sourceMistakeHeadingLocalesTranslated: {
    defaultMessage: "Locales already translated from this source",
    id: "5EvVEEZZG4",
    description: "Description skeleton heading for the source mistake issue template",
  },

  contextRequestLabel: {
    defaultMessage: "Context request",
    id: "Na/bufJX8b",
    description: "Label for the context request issue template",
  },
  contextRequestHeadingAmbiguous: {
    defaultMessage: "What is ambiguous or unclear",
    id: "yUi5e+hJXv",
    description: "Description skeleton heading for the context request issue template",
  },
  contextRequestHeadingNeeded: {
    defaultMessage: "What you need in order to translate it (audience, tone, who is speaking)",
    id: "fHo3lZ3Ncd",
    description: "Description skeleton heading for the context request issue template",
  },
  contextRequestHeadingWhereAppears: {
    defaultMessage: "Where this string appears in the product (screen, button, dialog)",
    id: "FExdwoMXgT",
    description: "Description skeleton heading for the context request issue template",
  },

  glossaryViolationLabel: {
    defaultMessage: "Glossary violation",
    id: "JpBSOLxq+p",
    description: "Label for the glossary violation issue template",
  },
  glossaryViolationHeadingApprovedTerm: {
    defaultMessage: "Approved glossary term",
    id: "FAiaLlxyiD",
    description: "Description skeleton heading for the glossary violation issue template",
  },
  glossaryViolationHeadingTermUsed: {
    defaultMessage: "Term used instead",
    id: "l0LaeWZhOk",
    description: "Description skeleton heading for the glossary violation issue template",
  },
  glossaryViolationHeadingWhereDefined: {
    defaultMessage: "Where the approved term is defined (glossary or style guide)",
    id: "+GWoQaCIDa",
    description: "Description skeleton heading for the glossary violation issue template",
  },

  qaFailureLabel: {
    defaultMessage: "QA failure",
    id: "3J/2hNdEQN",
    description: "Label for the QA failure issue template",
  },
  qaFailureHeadingWhichCheck: {
    defaultMessage: "Which check failed",
    id: "1eMnlR8DFD",
    description: "Description skeleton heading for the QA failure issue template",
  },
  qaFailureHeadingExpected: {
    defaultMessage: "Expected result",
    id: "GMwM1mRHd4",
    description: "Description skeleton heading for the QA failure issue template",
  },
  qaFailureHeadingActual: {
    defaultMessage: "Actual result",
    id: "2/EGe6eITS",
    description: "Description skeleton heading for the QA failure issue template",
  },
  qaFailureHeadingReproduce: {
    defaultMessage: "How to reproduce",
    id: "fMYUxCt5P0",
    description: "Description skeleton heading for the QA failure issue template",
  },
});
