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

export const markdownEditorMessages = defineMessages({
  boldTitle: {
    defaultMessage: "Bold",
    id: "Qe6R9CCAC7",
    description: "Tooltip and accessible label for the bold formatting toolbar button",
  },
  boldLabel: {
    defaultMessage: "B",
    id: "O368wEYD1O",
    description: "Visible abbreviation on the bold formatting toolbar button",
  },
  italicTitle: {
    defaultMessage: "Italic",
    id: "2Ce/RC/wfJ",
    description: "Tooltip and accessible label for the italic formatting toolbar button",
  },
  italicLabel: {
    defaultMessage: "I",
    id: "2QU4QHjp8c",
    description: "Visible abbreviation on the italic formatting toolbar button",
  },
  heading2Title: {
    defaultMessage: "Heading 2",
    id: "g9BGh+CmB5",
    description: "Tooltip and accessible label for the level-2 heading toolbar button",
  },
  heading2Label: {
    defaultMessage: "H2",
    id: "ioubvwX5dG",
    description: "Visible abbreviation on the level-2 heading toolbar button",
  },
  heading3Title: {
    defaultMessage: "Heading 3",
    id: "JMPR7Ba6ot",
    description: "Tooltip and accessible label for the level-3 heading toolbar button",
  },
  heading3Label: {
    defaultMessage: "H3",
    id: "A2Qe3R87fV",
    description: "Visible abbreviation on the level-3 heading toolbar button",
  },
  bulletListLabel: {
    defaultMessage: "• List",
    id: "L3ycwnosUv",
    description: "Visible label for the bullet list toolbar button",
  },
  bulletListTitle: {
    defaultMessage: "Bullet list",
    id: "88gAEWUFj7",
    description: "Tooltip and accessible label for the bullet list toolbar button",
  },
  orderedListLabel: {
    defaultMessage: "1. List",
    id: "K89oxCMVZA",
    description: "Visible label for the numbered list toolbar button",
  },
  orderedListTitle: {
    defaultMessage: "Numbered list",
    id: "dZcHfTdmF2",
    description: "Tooltip and accessible label for the numbered list toolbar button",
  },
  blockquoteLabel: {
    defaultMessage: "Quote",
    id: "8w4ZXUPESp",
    description: "Visible label for the blockquote toolbar button",
  },
  blockquoteTitle: {
    defaultMessage: "Blockquote",
    id: "6ubkC6hfDe",
    description: "Tooltip and accessible label for the blockquote toolbar button",
  },
  codeLabel: {
    defaultMessage: "Code",
    id: "OnnGrPT4U5",
    description: "Visible label for the inline code toolbar button",
  },
  codeTitle: {
    defaultMessage: "Inline code",
    id: "Q26vSR4mR9",
    description: "Tooltip and accessible label for the inline code toolbar button",
  },
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
  mentionEmpty: {
    defaultMessage: "No matching people or issues",
    id: "Kw73KEGJmb",
    description: "Empty state when @ mention filter matches nothing",
  },
  mentionUsersSection: {
    defaultMessage: "Users",
    id: "GqfMhL6Yw/",
    description: "Section header for people in the @ mention popover",
  },
  mentionIssuesSection: {
    defaultMessage: "Issues",
    id: "BOD7YPsYm8",
    description: "Section header for issues in the @ mention popover",
  },
  commentPlaceholder: {
    defaultMessage: "Leave a comment… Use @ to mention",
    id: "bMFBHYX/jE",
    description: "Placeholder for the issue comment markdown composer",
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
  bubbleBold: {
    defaultMessage: "Bold",
    id: "DRi2LRug2G",
    description: "Bubble menu button to toggle bold text",
  },
  bubbleItalic: {
    defaultMessage: "Italic",
    id: "9l9T50rviR",
    description: "Bubble menu button to toggle italic text",
  },
  bubbleStrike: {
    defaultMessage: "Strikethrough",
    id: "rUPw7LyUVG",
    description: "Bubble menu button to toggle strikethrough text",
  },
  bubbleCode: {
    defaultMessage: "Inline code",
    id: "E7cU/WEnnG",
    description: "Bubble menu button to toggle inline code",
  },
  bubbleLink: {
    defaultMessage: "Link",
    id: "CT9/X7v9OM",
    description: "Bubble menu button to add or remove a hyperlink",
  },
});
