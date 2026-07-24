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
import type { Editor, Range } from "@tiptap/core";
import type { IconSvgElement } from "@hugeicons/react";
import {
  CheckListIcon,
  CodeIcon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  LeftToRightBlockQuoteIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
} from "@hugeicons/core-free-icons";
import type { IntlShape } from "react-intl";

import { markdownDescriptionEditorMessages as messages } from "./markdown-description-editor.messages";

export type MarkdownSlashShortcutPart = "mod" | "alt" | "shift" | (string & {});

export type MarkdownSlashCommandItem = {
  id: string;
  title: string;
  icon: IconSvgElement;
  keywords: string[];
  shortcut?: MarkdownSlashShortcutPart[];
  run: (props: { editor: Editor; range: Range }) => void;
};

function deleteTriggerAndRun(editor: Editor, range: Range, run: () => boolean | void) {
  editor.chain().focus().deleteRange(range).run();
  run();
}

export function formatMarkdownSlashShortcut(
  isMac: boolean,
  parts: MarkdownSlashShortcutPart[],
): string {
  return parts
    .map((part) => {
      if (part === "mod") {
        return isMac ? "⌘" : "Ctrl";
      }
      if (part === "alt") {
        return isMac ? "⌥" : "Alt";
      }
      if (part === "shift") {
        return isMac ? "⇧" : "Shift";
      }
      return part;
    })
    .join(isMac ? " " : "+");
}

export function buildMarkdownSlashCommandItems(intl: IntlShape): MarkdownSlashCommandItem[] {
  const linkPrompt = intl.formatMessage(messages.linkPrompt);

  return [
    {
      id: "heading1",
      title: intl.formatMessage(messages.slashHeading1Title),
      icon: Heading01Icon,
      keywords: ["heading", "h1", "title"],
      shortcut: ["mod", "alt", "1"],
      run: ({ editor, range }) => {
        deleteTriggerAndRun(editor, range, () =>
          editor.chain().focus().toggleHeading({ level: 1 }).run(),
        );
      },
    },
    {
      id: "heading2",
      title: intl.formatMessage(messages.slashHeading2Title),
      icon: Heading02Icon,
      keywords: ["heading", "h2", "title"],
      shortcut: ["mod", "alt", "2"],
      run: ({ editor, range }) => {
        deleteTriggerAndRun(editor, range, () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        );
      },
    },
    {
      id: "heading3",
      title: intl.formatMessage(messages.slashHeading3Title),
      icon: Heading03Icon,
      keywords: ["heading", "h3", "subtitle"],
      shortcut: ["mod", "alt", "3"],
      run: ({ editor, range }) => {
        deleteTriggerAndRun(editor, range, () =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
        );
      },
    },
    {
      id: "bulletList",
      title: intl.formatMessage(messages.slashBulletListTitle),
      icon: LeftToRightListBulletIcon,
      keywords: ["bullet", "bulleted", "list", "unordered", "ul"],
      shortcut: ["mod", "shift", "8"],
      run: ({ editor, range }) => {
        deleteTriggerAndRun(editor, range, () => editor.chain().focus().toggleBulletList().run());
      },
    },
    {
      id: "orderedList",
      title: intl.formatMessage(messages.slashOrderedListTitle),
      icon: LeftToRightListNumberIcon,
      keywords: ["numbered", "ordered", "list", "ol"],
      shortcut: ["mod", "shift", "9"],
      run: ({ editor, range }) => {
        deleteTriggerAndRun(editor, range, () => editor.chain().focus().toggleOrderedList().run());
      },
    },
    {
      id: "taskList",
      title: intl.formatMessage(messages.slashTaskListTitle),
      icon: CheckListIcon,
      keywords: ["checklist", "todo", "task", "checkbox"],
      shortcut: ["mod", "shift", "7"],
      run: ({ editor, range }) => {
        deleteTriggerAndRun(editor, range, () => editor.chain().focus().toggleTaskList().run());
      },
    },
    {
      id: "codeBlock",
      title: intl.formatMessage(messages.slashCodeBlockTitle),
      icon: CodeIcon,
      keywords: ["code", "pre", "snippet"],
      shortcut: ["mod", "alt", "c"],
      run: ({ editor, range }) => {
        deleteTriggerAndRun(editor, range, () => editor.chain().focus().toggleCodeBlock().run());
      },
    },
    {
      id: "blockquote",
      title: intl.formatMessage(messages.slashBlockquoteTitle),
      icon: LeftToRightBlockQuoteIcon,
      keywords: ["quote", "blockquote"],
      shortcut: ["mod", "shift", "b"],
      run: ({ editor, range }) => {
        deleteTriggerAndRun(editor, range, () => editor.chain().focus().toggleBlockquote().run());
      },
    },
    {
      id: "link",
      title: intl.formatMessage(messages.slashLinkTitle),
      icon: Link01Icon,
      keywords: ["link", "url", "href"],
      run: ({ editor, range }) => {
        const { from, to } = editor.state.selection;
        const selectedText = from !== to ? editor.state.doc.textBetween(from, to, " ") : "link";
        const url = window.prompt(linkPrompt, "https://");
        if (url === null) {
          return;
        }
        const trimmed = url.trim();
        if (trimmed === "") {
          return;
        }
        editor.chain().focus().deleteRange(range).run();
        editor
          .chain()
          .focus()
          .insertContent(`[${selectedText}](${trimmed})`, { contentType: "markdown" })
          .run();
      },
    },
  ];
}

export function filterMarkdownSlashCommandItems(items: MarkdownSlashCommandItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }

  return items.filter((item) => {
    if (item.title.toLowerCase().includes(normalized)) {
      return true;
    }
    return item.keywords.some((keyword) => keyword.includes(normalized));
  });
}
