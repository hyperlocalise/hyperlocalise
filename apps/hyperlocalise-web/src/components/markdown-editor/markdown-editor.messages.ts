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

export const markdownDescriptionEditorMessages = defineMessages({
  placeholder: {
    defaultMessage: "Write, or type / for blocks…",
    id: "fjjjlNCOer",
    description: "Placeholder shown in an empty markdown description editor",
  },
  taskDescriptionAria: {
    defaultMessage: "Task description",
    id: "UU5/+HYaD2",
    description: "Accessible label for the markdown description editor field",
  },
  markdownContentAria: {
    defaultMessage: "Markdown content",
    id: "ECh2wuwOCJ",
    description: "Default accessible label for read-only rendered markdown content",
  },
  noDescription: {
    defaultMessage: "No description",
    id: "++FVhiWhMw",
    description: "Empty state message when a markdown description preview has no content",
  },
  taskDescriptionPreviewAria: {
    defaultMessage: "Task description preview",
    id: "fvXYWA/jR+",
    description: "Accessible label for the read-only markdown description preview",
  },
  linkPrompt: {
    defaultMessage: "Enter URL",
    id: "iEwQSllTi8",
    description: "Prompt shown when adding a hyperlink via the slash menu",
  },
  slashEmpty: {
    defaultMessage: "No matching blocks",
    id: "lUH3RGUMfU",
    description: "Empty state when slash command filter matches nothing",
  },
  slashHeading1Title: {
    defaultMessage: "Heading 1",
    id: "sQepOjPr4u",
    description: "Slash menu item for a level-1 heading",
  },
  slashHeading2Title: {
    defaultMessage: "Heading 2",
    id: "tZ64yYuboY",
    description: "Slash menu item for a level-2 heading",
  },
  slashHeading3Title: {
    defaultMessage: "Heading 3",
    id: "1KXz+b/LeX",
    description: "Slash menu item for a level-3 heading",
  },
  slashBulletListTitle: {
    defaultMessage: "Bulleted list",
    id: "eB3Kj7/0av",
    description: "Slash menu item for a bullet list",
  },
  slashOrderedListTitle: {
    defaultMessage: "Numbered list",
    id: "sZ3Qm/SOaW",
    description: "Slash menu item for a numbered list",
  },
  slashTaskListTitle: {
    defaultMessage: "Checklist",
    id: "bKVGEe8Imh",
    description: "Slash menu item for a task checklist",
  },
  slashBlockquoteTitle: {
    defaultMessage: "Quote",
    id: "/AAFYQZiFS",
    description: "Slash menu item for a blockquote",
  },
  slashCodeBlockTitle: {
    defaultMessage: "Code block",
    id: "UfyoQ9IKvC",
    description: "Slash menu item for a fenced code block",
  },
  slashLinkTitle: {
    defaultMessage: "Link",
    id: "YyO52dNKVM",
    description: "Slash menu item for inserting a hyperlink",
  },
});
