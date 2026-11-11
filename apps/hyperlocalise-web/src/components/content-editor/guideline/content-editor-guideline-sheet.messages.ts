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

export const contentEditorGuidelineSheetMessages = defineMessages({
  title: {
    defaultMessage: "Guideline",
    id: "ZVjGHNckcC",
    description: "Title for the content editor guideline sheet",
  },
  descriptionStyleGuide: {
    defaultMessage: "Tone, terminology, and formatting for this project.",
    id: "9e9a/69ACn",
    description: "Description for the style guide tab in the editor guideline sheet",
  },
  descriptionGuideline: {
    defaultMessage: "Documents in scope for this project.",
    id: "s0KZePn4lW",
    description: "Description for the guideline tab in the editor guideline sheet",
  },
  tabStyleGuide: {
    defaultMessage: "Style guide",
    id: "RL5AevpFPI",
    description: "Tab label for project style guide in the editor guideline sheet",
  },
  tabGuideline: {
    defaultMessage: "Guideline",
    id: "q+WK+cU/ej",
    description: "Tab label for guideline documents in the editor guideline sheet",
  },
  loading: {
    defaultMessage: "Loading…",
    id: "G+NJ7A8R9g",
    description: "Loading state for guideline sheet content",
  },
  loadError: {
    defaultMessage: "Unable to load this guideline.",
    id: "OECd5uDK9/",
    description: "Error when guideline content fails to load",
  },
  emptyStyleGuide: {
    defaultMessage: "No style guide yet. Add one in project settings.",
    id: "9ll1eHub6k",
    description: "Empty state for style guide tab",
  },
  emptyGuideline: {
    defaultMessage: "No guideline for this project yet.",
    id: "CZ4vxLK47b",
    description: "Empty state for the guideline tab in the editor guideline sheet",
  },
  editStyleGuide: {
    defaultMessage: "Edit in settings",
    id: "mBQ9xkM/3m",
    description: "Link to project settings from style guide tab",
  },
  openKnowledge: {
    defaultMessage: "Open knowledge",
    id: "XH6ikfkioo",
    description: "Link from the editor guideline sheet to the project knowledge page",
  },
  showDocument: {
    defaultMessage: "Show {title}",
    id: "XCeIO0kKvi",
    description: "Button that expands a guideline document in the editor sheet",
  },
  hideDocument: {
    defaultMessage: "Hide {title}",
    id: "jzHn8+99pe",
    description: "Button that collapses a guideline document in the editor sheet",
  },
  allLocales: {
    defaultMessage: "All locales",
    id: "HdjslZ2CfZ",
    description: "Label for a guideline document that applies to every target locale",
  },
  alwaysApply: {
    defaultMessage: "Always apply",
    id: "kXyIYUDGHZ",
    description: "Badge for a guideline document that is always included in full",
  },
  processing: {
    defaultMessage: "Processing",
    id: "XVzHC8py80",
    description: "Status badge for a guideline document that is still being read",
  },
  failed: {
    defaultMessage: "Failed",
    id: "F8dRl91XI1",
    description: "Status badge for a guideline document that could not be read",
  },
  previewUnavailable: {
    defaultMessage: "This document has no readable text yet.",
    id: "XL3HPQrRJ1",
    description: "Shown when a guideline document has no previewable content",
  },
});
