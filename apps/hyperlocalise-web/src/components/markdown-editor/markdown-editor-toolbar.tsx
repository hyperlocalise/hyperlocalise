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
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { cn } from "@/lib/primitives/cn";

import {
  insertMarkdownEditorImageFromUpload,
  insertMarkdownEditorImageFromUrl,
  pickMarkdownEditorImageFile,
  type MarkdownEditorImageUploadConfig,
} from "./markdown-editor-image";
import { markdownEditorMessages } from "./markdown-editor.messages";

type MarkdownCommandChain = ReturnType<Editor["chain"]> & {
  toggleBold: () => MarkdownCommandChain;
  toggleItalic: () => MarkdownCommandChain;
  toggleHeading: (attributes: { level: 2 | 3 }) => MarkdownCommandChain;
  toggleBlockquote: () => MarkdownCommandChain;
  toggleCode: () => MarkdownCommandChain;
};

function markdownCommandChain(editor: Editor): MarkdownCommandChain {
  return editor.chain().focus() as unknown as MarkdownCommandChain;
}

function MarkdownToolbarButton({
  label,
  title,
  pressed = false,
  disabled = false,
  onClick,
}: {
  label: string;
  title: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => {
        // Keep the editor selection while clicking the toolbar control.
        event.preventDefault();
      }}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded border border-transparent px-2 text-xs font-medium text-subtle-foreground transition-colors",
        "hover:border-border hover:bg-muted hover:text-foreground",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        pressed && "border-border bg-skeleton text-foreground",
      )}
    >
      {label}
    </button>
  );
}

async function insertImageViaToolbar(
  editor: Editor,
  intl: ReturnType<typeof useIntl>,
  imageUpload: MarkdownEditorImageUploadConfig | null,
) {
  if (imageUpload) {
    const file = await pickMarkdownEditorImageFile();
    if (!file) {
      insertMarkdownEditorImageFromUrl(
        editor,
        intl.formatMessage(markdownEditorMessages.imagePrompt),
      );
      return;
    }
    try {
      await insertMarkdownEditorImageFromUpload({
        editor,
        file,
        upload: imageUpload,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "image_upload_failed";
      if (code === "unsupported_image_type") {
        toast.error(intl.formatMessage(markdownEditorMessages.imageUnsupportedType));
      } else if (code === "image_too_large" || code === "file_upload_too_large") {
        toast.error(intl.formatMessage(markdownEditorMessages.imageTooLarge));
      } else {
        toast.error(intl.formatMessage(markdownEditorMessages.imageUploadFailed));
      }
    }
    return;
  }

  insertMarkdownEditorImageFromUrl(editor, intl.formatMessage(markdownEditorMessages.imagePrompt));
}

export function MarkdownEditorToolbar({
  editor,
  disabled,
  imageUpload = null,
}: {
  editor: Editor;
  disabled: boolean;
  imageUpload?: MarkdownEditorImageUploadConfig | null;
}) {
  const intl = useIntl();
  const isDisabled = disabled || !editor.isEditable;
  const activeMarks = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => ({
      bold: activeEditor.isActive("bold"),
      italic: activeEditor.isActive("italic"),
      heading2: activeEditor.isActive("heading", { level: 2 }),
      heading3: activeEditor.isActive("heading", { level: 3 }),
      bulletList: activeEditor.isActive("bulletList"),
      orderedList: activeEditor.isActive("orderedList"),
      blockquote: activeEditor.isActive("blockquote"),
      code: activeEditor.isActive("code"),
    }),
  });

  return (
    <div
      data-markdown-toolbar=""
      className="flex flex-wrap items-center gap-1 border-b border-border bg-muted px-2 py-1.5"
    >
      <MarkdownToolbarButton
        label={intl.formatMessage(markdownEditorMessages.boldLabel)}
        title={intl.formatMessage(markdownEditorMessages.boldTitle)}
        pressed={activeMarks.bold}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleBold().run()}
      />
      <MarkdownToolbarButton
        label={intl.formatMessage(markdownEditorMessages.italicLabel)}
        title={intl.formatMessage(markdownEditorMessages.italicTitle)}
        pressed={activeMarks.italic}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleItalic().run()}
      />
      <MarkdownToolbarButton
        label={intl.formatMessage(markdownEditorMessages.heading2Label)}
        title={intl.formatMessage(markdownEditorMessages.heading2Title)}
        pressed={activeMarks.heading2}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleHeading({ level: 2 }).run()}
      />
      <MarkdownToolbarButton
        label={intl.formatMessage(markdownEditorMessages.heading3Label)}
        title={intl.formatMessage(markdownEditorMessages.heading3Title)}
        pressed={activeMarks.heading3}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleHeading({ level: 3 }).run()}
      />
      <MarkdownToolbarButton
        label={intl.formatMessage(markdownEditorMessages.bulletListLabel)}
        title={intl.formatMessage(markdownEditorMessages.bulletListTitle)}
        pressed={activeMarks.bulletList}
        disabled={isDisabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <MarkdownToolbarButton
        label={intl.formatMessage(markdownEditorMessages.orderedListLabel)}
        title={intl.formatMessage(markdownEditorMessages.orderedListTitle)}
        pressed={activeMarks.orderedList}
        disabled={isDisabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <MarkdownToolbarButton
        label={intl.formatMessage(markdownEditorMessages.blockquoteLabel)}
        title={intl.formatMessage(markdownEditorMessages.blockquoteTitle)}
        pressed={activeMarks.blockquote}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleBlockquote().run()}
      />
      <MarkdownToolbarButton
        label={intl.formatMessage(markdownEditorMessages.codeLabel)}
        title={intl.formatMessage(markdownEditorMessages.codeTitle)}
        pressed={activeMarks.code}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleCode().run()}
      />
      <MarkdownToolbarButton
        label={intl.formatMessage(markdownEditorMessages.imageLabel)}
        title={intl.formatMessage(markdownEditorMessages.imageTitle)}
        disabled={isDisabled}
        onClick={() => {
          void insertImageViaToolbar(editor, intl, imageUpload);
        }}
      />
    </div>
  );
}
