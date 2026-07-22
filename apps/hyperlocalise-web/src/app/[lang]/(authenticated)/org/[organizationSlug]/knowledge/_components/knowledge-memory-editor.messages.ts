"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const knowledgeMemoryEditorMessages = defineMessages({
  title: {
    defaultMessage: "Organization memory",
    id: "cGZAPE84bW",
    description: "Heading for the organization knowledge memory editor",
  },
  description: {
    defaultMessage:
      "One markdown document for localization rules, glossary notes, brand guidance, and things to avoid.",
    id: "6mSsZi1QjK",
    description: "Description under the organization knowledge memory editor heading",
  },
  lastUpdated: {
    defaultMessage: "Last updated {timestamp}",
    id: "noSrhn1pJ3",
    description: "Shows when the organization knowledge memory was last saved",
  },
  notSavedYet: {
    defaultMessage: "Not saved yet",
    id: "pzP0LynEOg",
    description: "Shown when organization knowledge memory has never been saved",
  },
  memoryLabel: {
    defaultMessage: "Memory.md",
    id: "tgQz/g+KA0",
    description: "Label for the organization knowledge memory markdown field",
  },
  overLimitError: {
    defaultMessage: "Knowledge memory must be {limit} characters or less.",
    id: "e6dWjFyp+5",
    description: "Error when organization knowledge memory exceeds the character limit",
  },
  characterCount: {
    defaultMessage: "{count}/{limit} characters",
    id: "crhiHIjb38",
    description: "Character count for the organization knowledge memory editor",
  },
  saving: {
    defaultMessage: "Saving",
    id: "8l8bAaSw0Y",
    description: "Save button label while organization knowledge memory is saving",
  },
  save: {
    defaultMessage: "Save",
    id: "5d21vrW8b9",
    description: "Save button label for organization knowledge memory",
  },
  previewTitle: {
    defaultMessage: "Retrieval preview",
    id: "W/c1gMXI8X",
    description: "Heading for the knowledge memory retrieval preview section",
  },
  previewDescription: {
    defaultMessage: "Test what saved Memory.md guidance would be loaded for a translation query.",
    id: "Kyj/6Mb2oy",
    description: "Description for the knowledge memory retrieval preview section",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "lDRDJJcswg",
    description: "Label for the knowledge memory preview target locale field",
  },
  sourceTextLabel: {
    defaultMessage: "Source text",
    id: "EraI1sZNxF",
    description: "Label for the knowledge memory preview source text field",
  },
  saveBeforePreview: {
    defaultMessage: "Save changes before previewing updated memory.",
    id: "UB4eOrmqpw",
    description: "Hint when unsaved knowledge memory changes block an accurate preview",
  },
  previewUsesSaved: {
    defaultMessage: "Preview uses the saved markdown memory.",
    id: "/iwtwhLhum",
    description: "Hint when the knowledge memory preview uses the saved document",
  },
  previewing: {
    defaultMessage: "Previewing",
    id: "7A+ivEeF6T",
    description: "Preview button label while knowledge memory retrieval is running",
  },
  preview: {
    defaultMessage: "Preview",
    id: "SiPCg9X6AE",
    description: "Preview button label for knowledge memory retrieval",
  },
  selectedCount: {
    defaultMessage: "{count} selected",
    id: "edDxW76Fj5",
    description: "Badge showing how many memory sections were selected for a preview",
  },
  charsSelected: {
    defaultMessage: "{selected}/{total} chars",
    id: "yIpwcI2dct",
    description: "Badge showing selected versus total knowledge memory character counts",
  },
  noMemorySelected: {
    defaultMessage: "(no memory selected)",
    id: "AVpvSFVkzQ",
    description: "Placeholder when knowledge memory preview returns no compact text",
  },
  matchedHeadings: {
    defaultMessage: "Matched headings",
    id: "U33IyIY5fW",
    description: "Heading above matched knowledge memory heading paths in preview results",
  },
});
