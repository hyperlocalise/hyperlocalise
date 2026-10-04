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
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useIntl } from "react-intl";

import { createMarkdownSlashCommandExtension } from "@/components/markdown-editor/markdown-editor-slash-extension";
import { filterMarkdownSlashCommandItems } from "@/components/markdown-editor/markdown-editor-slash-items";
import type { MarkdownSelectionAiConfig } from "@/components/markdown-editor/markdown-selection-ai.types";
import { cn } from "@/lib/primitives/cn";

import { DocumentEditorBlockHandle } from "./document-editor-block-handle";
import { buildDocumentSlashCommandItems } from "./document-editor-block-types";
import { DocumentEditorBubbleToolbar } from "./document-editor-bubble-toolbar";
import {
  createDocumentSchemaExtensions,
  normalizeDocumentMarkdown,
  type DocumentEditorSyntax,
} from "./document-editor-extensions";
import {
  DocumentCalloutWithView,
  MdxComponentWithView,
  MdxInlineWithView,
  MdxRawWithView,
} from "./document-editor-node-views";
import { DocumentEditorOutline } from "./document-editor-outline";
import { DocumentSuggestions } from "./document-editor-suggestions";
import { documentEditorMessages as messages } from "./document-editor.messages";

const HEADING_PLACEHOLDERS = [
  messages.blockHeading1,
  messages.blockHeading2,
  messages.blockHeading3,
  messages.blockHeading3,
];

export function readDocumentEditorMarkdown(editor: Editor) {
  return normalizeDocumentMarkdown(editor.getMarkdown());
}

export function DocumentEditor({
  value,
  syntax,
  editable,
  ariaLabel,
  onChange,
  onInitialValue,
  onEditorChange,
  onFocusedBlockChange,
  onTranslateBlock,
  onAddToGlossary,
  selectionAi,
  flaggedBlocks,
  showOutline = true,
  className,
}: {
  value: string;
  syntax: DocumentEditorSyntax;
  editable: boolean;
  ariaLabel: string;
  onChange: (markdown: string) => void;
  /** Reports the normalized load value so callers can use it as the save baseline. */
  onInitialValue?: (markdown: string) => void;
  onEditorChange?: (editor: Editor | null) => void;
  onFocusedBlockChange?: (blockIndex: number | null) => void;
  onTranslateBlock?: (blockIndex: number) => void;
  onAddToGlossary?: (text: string) => void;
  selectionAi?: MarkdownSelectionAiConfig;
  flaggedBlocks?: ReadonlySet<number>;
  showOutline?: boolean;
  className?: string;
}) {
  const intl = useIntl();
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onChange, onInitialValue, onFocusedBlockChange, onTranslateBlock });
  callbacksRef.current = { onChange, onInitialValue, onFocusedBlockChange, onTranslateBlock };
  const intlRef = useRef(intl);
  intlRef.current = intl;
  const editorRef = useRef<Editor | null>(null);

  const translateBlockAtSelection = useCallback(() => {
    const current = editorRef.current;
    const translate = callbacksRef.current.onTranslateBlock;
    if (!current || !translate) return;
    translate(current.state.selection.$from.index(0));
  }, []);

  const extensions = useMemo(
    () => [
      ...createDocumentSchemaExtensions(syntax, {
        callout: DocumentCalloutWithView,
        mdxRaw: MdxRawWithView,
        mdxComponent: MdxComponentWithView,
        mdxInline: MdxInlineWithView,
      }),
      Placeholder.configure({
        includeChildren: true,
        showOnlyCurrent: true,
        placeholder: ({ node }) => {
          const currentIntl = intlRef.current;
          if (node.type.name === "heading") {
            const level = Math.min(Math.max(Number(node.attrs.level) || 1, 1), 4);
            return currentIntl.formatMessage(HEADING_PLACEHOLDERS[level - 1]);
          }
          return node.type.name === "paragraph"
            ? currentIntl.formatMessage(messages.placeholder)
            : "";
        },
      }),
      createMarkdownSlashCommandExtension(() => ({
        resolveItems: (query) =>
          filterMarkdownSlashCommandItems(
            buildDocumentSlashCommandItems(intlRef.current, {
              onTranslateBlock: callbacksRef.current.onTranslateBlock
                ? translateBlockAtSelection
                : null,
            }),
            query,
          ),
        emptyLabel: intlRef.current.formatMessage(messages.slashEmpty),
      })),
      DocumentSuggestions.configure({
        getLabels: () => ({
          accept: intlRef.current.formatMessage(messages.suggestionAccept),
          reject: intlRef.current.formatMessage(messages.suggestionReject),
          outdated: intlRef.current.formatMessage(messages.suggestionOutdated),
        }),
      }),
    ],
    [syntax, translateBlockAtSelection],
  );

  const editor = useEditor(
    {
      extensions,
      content: value,
      contentType: "markdown",
      editable,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "document-editor-content min-h-[24rem] pb-32",
          "aria-label": ariaLabel,
          spellcheck: "true",
        },
      },
      onCreate: ({ editor: created }) => {
        const markdown = readDocumentEditorMarkdown(created);
        lastEmittedRef.current = markdown;
        callbacksRef.current.onInitialValue?.(markdown);
      },
      onUpdate: ({ editor: updated }) => {
        const markdown = readDocumentEditorMarkdown(updated);
        if (markdown === lastEmittedRef.current) return;
        lastEmittedRef.current = markdown;
        callbacksRef.current.onChange(markdown);
      },
      onSelectionUpdate: ({ editor: updated }) => {
        callbacksRef.current.onFocusedBlockChange?.(updated.state.selection.$from.index(0));
      },
      onFocus: ({ editor: focused }) => {
        callbacksRef.current.onFocusedBlockChange?.(focused.state.selection.$from.index(0));
      },
    },
    [extensions],
  );
  editorRef.current = editor;

  useEffect(() => {
    onEditorChange?.(editor);
    return () => onEditorChange?.(null);
  }, [editor, onEditorChange]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || value === lastEmittedRef.current) return;
    if (value === readDocumentEditorMarkdown(editor)) {
      lastEmittedRef.current = value;
      return;
    }
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    lastEmittedRef.current = readDocumentEditorMarkdown(editor);
  }, [editor, value]);

  return (
    <div className={cn("relative flex justify-center gap-4", className)}>
      <div ref={canvasRef} className="relative w-full max-w-[46rem] min-w-0 ps-14 pe-6">
        {editor ? (
          <DocumentEditorBlockHandle
            editor={editor}
            containerRef={canvasRef}
            onTranslateBlock={
              onTranslateBlock
                ? (blockPos) => onTranslateBlock(editor.state.doc.resolve(blockPos).index(0))
                : undefined
            }
          />
        ) : null}
        <EditorContent editor={editor} />
        {editor ? (
          <DocumentEditorBubbleToolbar
            editor={editor}
            selectionAi={selectionAi}
            onAddToGlossary={onAddToGlossary}
          />
        ) : null}
      </div>
      {showOutline ? (
        <div className="sticky top-16 hidden h-fit w-10 shrink-0 self-start pt-2 lg:block">
          {editor ? <DocumentEditorOutline editor={editor} flaggedBlocks={flaggedBlocks} /> : null}
        </div>
      ) : null}
    </div>
  );
}
