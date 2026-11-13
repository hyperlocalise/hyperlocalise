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
import {
  CodeIcon,
  InfoIcon,
  ListBulletsIcon,
  ListChecksIcon,
  ListNumbersIcon,
  MinusIcon,
  QuotesIcon,
  SparkleIcon,
  TableIcon,
  TextHOneIcon,
  TextHThreeIcon,
  TextHTwoIcon,
  TextTIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { IntlShape, MessageDescriptor } from "react-intl";

import {
  buildMarkdownSlashCommandItems,
  type MarkdownSlashCommandItem,
} from "@/components/markdown-editor/markdown-editor-slash-items";

import { documentEditorMessages as messages } from "./document-editor.messages";

export type DocumentBlockType = {
  id: string;
  label: MessageDescriptor;
  icon: Icon;
  isActive: (editor: Editor) => boolean;
  apply: (editor: Editor) => void;
};

function clearBlockWrappers(editor: Editor) {
  const chain = editor.chain().focus();
  if (editor.isActive("bulletList")) chain.toggleBulletList();
  if (editor.isActive("orderedList")) chain.toggleOrderedList();
  if (editor.isActive("taskList")) chain.toggleTaskList();
  if (editor.isActive("blockquote")) chain.lift("blockquote");
  if (editor.isActive("callout")) chain.lift("callout");
  return chain;
}

/** Text-like block types a block can be turned into. */
export const DOCUMENT_BLOCK_TYPES: DocumentBlockType[] = [
  {
    id: "paragraph",
    label: messages.blockText,
    icon: TextTIcon,
    isActive: (editor) =>
      editor.isActive("paragraph") &&
      !editor.isActive("bulletList") &&
      !editor.isActive("orderedList") &&
      !editor.isActive("taskList") &&
      !editor.isActive("blockquote") &&
      !editor.isActive("callout"),
    apply: (editor) => clearBlockWrappers(editor).setParagraph().run(),
  },
  ...([1, 2, 3] as const).map((level): DocumentBlockType => ({
    id: `heading${level}`,
    label: [messages.blockHeading1, messages.blockHeading2, messages.blockHeading3][level - 1],
    icon: [TextHOneIcon, TextHTwoIcon, TextHThreeIcon][level - 1],
    isActive: (editor) => editor.isActive("heading", { level }),
    apply: (editor) => clearBlockWrappers(editor).setHeading({ level }).run(),
  })),
  {
    id: "bulletList",
    label: messages.blockBulletList,
    icon: ListBulletsIcon,
    isActive: (editor) => editor.isActive("bulletList"),
    apply: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "orderedList",
    label: messages.blockOrderedList,
    icon: ListNumbersIcon,
    isActive: (editor) => editor.isActive("orderedList"),
    apply: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "taskList",
    label: messages.blockTaskList,
    icon: ListChecksIcon,
    isActive: (editor) => editor.isActive("taskList"),
    apply: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    id: "blockquote",
    label: messages.blockQuote,
    icon: QuotesIcon,
    isActive: (editor) => editor.isActive("blockquote"),
    apply: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "callout",
    label: messages.blockCallout,
    icon: InfoIcon,
    isActive: (editor) => editor.isActive("callout"),
    apply: (editor) => {
      if (editor.isActive("callout")) {
        editor.chain().focus().lift("callout").run();
        return;
      }
      editor.chain().focus().setCallout("note").run();
    },
  },
  {
    id: "codeBlock",
    label: messages.blockCode,
    icon: CodeIcon,
    isActive: (editor) => editor.isActive("codeBlock"),
    apply: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

export function activeDocumentBlockType(editor: Editor): DocumentBlockType {
  const candidates = DOCUMENT_BLOCK_TYPES.filter((type) => type.id !== "paragraph");
  return candidates.find((type) => type.isActive(editor)) ?? DOCUMENT_BLOCK_TYPES[0];
}

function runAfterDeletingTrigger(editor: Editor, range: Range, run: () => void) {
  editor.chain().focus().deleteRange(range).run();
  run();
}

export function buildDocumentSlashCommandItems(
  intl: IntlShape,
  options: { onTranslateBlock?: (() => void) | null } = {},
): MarkdownSlashCommandItem[] {
  const basic = intl.formatMessage(messages.slashGroupBasic);
  const media = intl.formatMessage(messages.slashGroupMedia);
  const components = intl.formatMessage(messages.slashGroupComponents);
  const ai = intl.formatMessage(messages.slashGroupAi);
  const shared = new Map(buildMarkdownSlashCommandItems(intl).map((item) => [item.id, item]));
  const pick = (id: string, group: string): MarkdownSlashCommandItem[] => {
    const item = shared.get(id);
    return item ? [{ ...item, group }] : [];
  };

  const items: MarkdownSlashCommandItem[] = [
    {
      id: "paragraph",
      title: intl.formatMessage(messages.blockText),
      icon: TextTIcon,
      keywords: ["text", "paragraph", "plain"],
      group: basic,
      run: ({ editor, range }) =>
        runAfterDeletingTrigger(editor, range, () => {
          editor.chain().focus().setParagraph().run();
        }),
    },
    ...pick("heading1", basic),
    ...pick("heading2", basic),
    ...pick("heading3", basic),
    ...pick("bulletList", basic),
    ...pick("orderedList", basic),
    ...pick("taskList", basic),
    ...pick("blockquote", basic),
    ...pick("codeBlock", basic),
    {
      id: "divider",
      title: intl.formatMessage(messages.blockDivider),
      icon: MinusIcon,
      keywords: ["divider", "separator", "hr", "rule", "line"],
      group: basic,
      run: ({ editor, range }) =>
        runAfterDeletingTrigger(editor, range, () => {
          editor.chain().focus().setHorizontalRule().run();
        }),
    },
    ...pick("image", media),
    ...pick("link", media),
    {
      id: "table",
      title: intl.formatMessage(messages.blockTable),
      icon: TableIcon,
      keywords: ["table", "grid", "rows", "columns"],
      group: components,
      run: ({ editor, range }) =>
        runAfterDeletingTrigger(editor, range, () => {
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        }),
    },
    {
      id: "callout",
      title: intl.formatMessage(messages.blockCallout),
      icon: InfoIcon,
      keywords: ["callout", "note", "tip", "warning", "alert", "admonition"],
      group: components,
      run: ({ editor, range }) =>
        runAfterDeletingTrigger(editor, range, () => {
          editor.chain().focus().setCallout("note").run();
        }),
    },
  ];

  const onTranslateBlock = options.onTranslateBlock;
  if (onTranslateBlock) {
    items.push({
      id: "translateBlock",
      title: intl.formatMessage(messages.translateBlock),
      icon: SparkleIcon,
      keywords: ["translate", "ai", "draft", "suggest"],
      group: ai,
      run: ({ editor, range }) =>
        runAfterDeletingTrigger(editor, range, () => {
          onTranslateBlock();
        }),
    });
  }

  return items;
}
