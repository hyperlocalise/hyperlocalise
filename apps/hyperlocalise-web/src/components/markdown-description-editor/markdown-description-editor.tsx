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
import { useCallback, useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import type { Extensions } from "@tiptap/core";
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { markdownDescriptionEditorMessages } from "./markdown-description-editor.messages";
import {
  buildMarkdownSlashCommandItems,
  filterMarkdownSlashCommandItems,
} from "./markdown-description-editor-slash-items";
import {
  createMarkdownSlashCommandExtension,
  type MarkdownSlashCommandConfig,
} from "./markdown-description-editor-slash-extension";

const markdownDescriptionContentClassName = cn(
  "max-w-none px-3 py-2 text-sm text-subtle-foreground focus:outline-none",
  "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:font-heading [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-foreground",
  "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-foreground",
  "[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-heading [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-foreground",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-1 [&_li>p]:my-0",
  "[&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:items-start [&_li[data-type=taskItem]]:gap-2",
  "[&_li[data-type=taskItem]_label]:mt-0.5",
  "[&_li[data-type=taskItem]_div]:flex-1",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-subtle-foreground",
  "[&_a]:text-foreground [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 [&_a:hover]:decoration-muted-foreground",
  "[&_code]:rounded [&_code]:bg-skeleton [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-skeleton [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
);

const markdownDescriptionMinimalContentClassName = cn(
  markdownDescriptionContentClassName,
  "px-0 py-1 text-foreground",
);

const markdownBaseExtensions = [
  StarterKit,
  Link.configure({
    openOnClick: false,
    linkOnPaste: true,
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Markdown,
] as unknown as Extensions;

function useMarkdownEditorExtensions(getSlashConfig: () => MarkdownSlashCommandConfig) {
  return useMemo(
    () =>
      [
        ...markdownBaseExtensions,
        createMarkdownSlashCommandExtension(getSlashConfig),
      ] as unknown as Extensions,
    [getSlashConfig],
  );
}

export function MarkdownDescriptionEditor({
  value,
  onChange,
  onBlur,
  disabled = false,
  className,
  placeholder,
  ariaLabel,
  chrome = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Minimal inline chrome (Linear-style); markdown and keyboard shortcuts only. */
  chrome?: "default" | "minimal";
}) {
  const intl = useIntl();
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const slashConfigRef = useRef<MarkdownSlashCommandConfig>({
    resolveItems: () => [],
    emptyLabel: "",
  });
  slashConfigRef.current = {
    resolveItems: (query: string) =>
      filterMarkdownSlashCommandItems(buildMarkdownSlashCommandItems(intl), query),
    emptyLabel: intl.formatMessage(markdownDescriptionEditorMessages.slashEmpty),
  };
  const getSlashConfig = useCallback(() => slashConfigRef.current, []);
  const editorExtensions = useMarkdownEditorExtensions(getSlashConfig);
  const resolvedPlaceholder =
    placeholder ?? intl.formatMessage(markdownDescriptionEditorMessages.placeholder);
  const resolvedAriaLabel =
    ariaLabel ?? intl.formatMessage(markdownDescriptionEditorMessages.taskDescriptionAria);
  const isMinimal = chrome === "minimal";
  const editorContentClassName = cn(
    isMinimal ? markdownDescriptionMinimalContentClassName : markdownDescriptionContentClassName,
    isMinimal ? "min-h-[3rem]" : "min-h-[8rem]",
  );

  const editor = useEditor({
    extensions: editorExtensions,
    content: value,
    contentType: "markdown",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: activeEditor }) => {
      onChange(activeEditor.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: editorContentClassName,
        "aria-label": resolvedAriaLabel,
        "data-placeholder": resolvedPlaceholder,
      },
      handleDOMEvents: {
        blur: (_view, event) => {
          const relatedTarget = event.relatedTarget;
          if (
            relatedTarget instanceof Element &&
            relatedTarget.closest("[data-markdown-slash-menu]")
          ) {
            return false;
          }
          if (document.querySelector("[data-markdown-slash-menu]")) {
            // Focus can move to body while the floating menu mounts; keep editing.
            return false;
          }
          onBlurRef.current?.();
          return false;
        },
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentMarkdown = editor.getMarkdown();
    if (currentMarkdown === value) {
      return;
    }

    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setOptions({
      editorProps: {
        attributes: {
          class: editorContentClassName,
          "aria-label": resolvedAriaLabel,
          "data-placeholder": resolvedPlaceholder,
        },
        handleDOMEvents: {
          blur: (_view, event) => {
            const relatedTarget = event.relatedTarget;
            if (
              relatedTarget instanceof Element &&
              relatedTarget.closest("[data-markdown-slash-menu]")
            ) {
              return false;
            }
            if (document.querySelector("[data-markdown-slash-menu]")) {
              return false;
            }
            onBlurRef.current?.();
            return false;
          },
        },
      },
    });
  }, [editor, editorContentClassName, resolvedAriaLabel, resolvedPlaceholder]);

  const placeholderStyles = cn(
    "[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground",
    "[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
    "[&_.tiptap_p.is-editor-empty:first-child::before]:float-left",
    "[&_.tiptap_p.is-editor-empty:first-child::before]:h-0",
    "[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none",
  );

  if (!editor) {
    return (
      <div
        className={cn(
          isMinimal ? "min-h-[3rem]" : "min-h-[8rem] rounded-lg border border-border bg-muted",
          !isMinimal && "resize-y overflow-auto",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        isMinimal
          ? "[&_.tiptap]:min-h-[3rem]"
          : "rounded-lg border border-border bg-muted [&_.tiptap]:min-h-[8rem]",
        placeholderStyles,
        disabled && "opacity-60",
        className,
      )}
    >
      <EditorContent
        editor={editor}
        className={cn(
          isMinimal ? "min-h-[3rem]" : "max-h-[32rem] min-h-[8rem] resize-y overflow-auto",
        )}
      />
    </div>
  );
}

export function MarkdownContent({
  value,
  className,
  contentClassName,
  ariaLabel,
}: {
  value: string;
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
}) {
  const intl = useIntl();
  const resolvedAriaLabel =
    ariaLabel ?? intl.formatMessage(markdownDescriptionEditorMessages.markdownContentAria);

  const editor = useEditor({
    extensions: markdownBaseExtensions,
    content: value,
    contentType: "markdown",
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(markdownDescriptionContentClassName, contentClassName),
        "aria-label": resolvedAriaLabel,
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentMarkdown = editor.getMarkdown();
    if (currentMarkdown === value) {
      return;
    }

    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setOptions({
      editorProps: {
        attributes: {
          class: cn(markdownDescriptionContentClassName, contentClassName),
          "aria-label": resolvedAriaLabel,
        },
      },
    });
  }, [contentClassName, editor, resolvedAriaLabel]);

  if (!editor) {
    return (
      <div
        className={cn(className, contentClassName)}
        aria-busy="true"
        aria-label={resolvedAriaLabel}
      />
    );
  }

  return (
    <div className={className}>
      <EditorContent editor={editor} />
    </div>
  );
}

export function MarkdownDescriptionPreview({
  value,
  className,
  contentClassName,
  emptyMessage,
  chrome = "default",
}: {
  value: string;
  className?: string;
  contentClassName?: string;
  emptyMessage?: string;
  chrome?: "default" | "minimal";
}) {
  const intl = useIntl();
  const resolvedEmptyMessage =
    emptyMessage ?? intl.formatMessage(markdownDescriptionEditorMessages.noDescription);
  const previewAriaLabel = intl.formatMessage(
    markdownDescriptionEditorMessages.taskDescriptionPreviewAria,
  );
  const isMinimal = chrome === "minimal";

  if (!value.trim()) {
    return (
      <div
        className={cn(
          isMinimal
            ? "px-0 py-1 text-sm text-muted-foreground"
            : "rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground",
          className,
        )}
      >
        {resolvedEmptyMessage}
      </div>
    );
  }

  return (
    <MarkdownContent
      value={value}
      className={cn(isMinimal ? undefined : "rounded-lg border border-border bg-muted", className)}
      contentClassName={cn(
        isMinimal ? "px-0 py-1 text-foreground" : "min-h-[5rem]",
        contentClassName,
      )}
      ariaLabel={previewAriaLabel}
    />
  );
}
