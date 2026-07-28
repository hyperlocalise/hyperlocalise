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
import { useCallback, useEffect, useMemo, useRef, type FocusEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import type { Extensions } from "@tiptap/core";
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { MarkdownEditorBubbleMenu } from "./markdown-editor-bubble-menu";
import { markdownEditorMessages } from "./markdown-editor.messages";
import {
  buildMarkdownSlashCommandItems,
  filterMarkdownSlashCommandItems,
} from "./markdown-editor-slash-items";
import {
  createMarkdownSlashCommandExtension,
  type MarkdownSlashCommandConfig,
} from "./markdown-editor-slash-extension";
import { createMarkdownMentionExtension } from "./markdown-editor-mention-extension";
import {
  parseMentionHref,
  type MarkdownMentionConfig,
  type ParsedMarkdownMention,
} from "./markdown-editor-mention-types";
import { MarkdownEditorToolbar } from "./markdown-editor-toolbar";

export type { MarkdownMentionConfig, ParsedMarkdownMention } from "./markdown-editor-mention-types";
export { extractMentionIdsFromMarkdown, parseMentionHref } from "./markdown-editor-mention-types";

function isMarkdownEditorChromeTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "[data-markdown-slash-menu], [data-markdown-bubble-menu], [data-markdown-toolbar], [data-markdown-mention-menu]",
      ),
    )
  );
}

const markdownEditorContentClassName = cn(
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
  "[&_a[href^='mention:']]:cursor-pointer [&_a[href^='mention:']]:rounded-md [&_a[href^='mention:']]:bg-muted [&_a[href^='mention:']]:px-1 [&_a[href^='mention:']]:py-0.5 [&_a[href^='mention:']]:no-underline [&_a[href^='mention:']]:decoration-transparent",
  "[&_code]:rounded [&_code]:bg-skeleton [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-skeleton [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
);

const markdownEditorMinimalContentClassName = cn(
  markdownEditorContentClassName,
  "px-0 py-1 text-foreground",
);

const markdownPlaceholderStyles = cn(
  "[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none",
  "[&_.tiptap_p.is-editor-empty:first-child::before]:float-left",
  "[&_.tiptap_p.is-editor-empty:first-child::before]:h-0",
  "[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground",
  "[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
);

function tryHandleMentionClick(
  event: MouseEvent,
  onMentionNavigate: ((mention: ParsedMarkdownMention) => void) | undefined,
) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  const anchor = target.closest("a[href^='mention:']");
  if (!(anchor instanceof HTMLAnchorElement)) {
    return false;
  }
  const href = anchor.getAttribute("href");
  if (!href) {
    return false;
  }
  const mention = parseMentionHref(href);
  if (!mention) {
    return false;
  }
  // Always block browser navigation for mention: links (target=_blank etc.).
  event.preventDefault();
  event.stopPropagation();
  onMentionNavigate?.(mention);
  return true;
}

const markdownBaseExtensions = [
  StarterKit,
  Link.configure({
    openOnClick: false,
    linkOnPaste: true,
    protocols: ["http", "https", "mailto", "mention"],
    HTMLAttributes: {
      // Mentions are handled in-app; avoid browser opening mention: in a new tab.
      // External http(s) links still navigate via the browser default (same tab).
      target: null,
    },
    isAllowedUri: (url, ctx) => {
      try {
        if (url.startsWith("mention:")) {
          return true;
        }
        return ctx.defaultValidate(url);
      } catch {
        return false;
      }
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Markdown,
] as unknown as Extensions;

function useMarkdownEditorExtensions(
  getSlashConfig: () => MarkdownSlashCommandConfig,
  getMentionConfig: () => MarkdownMentionConfig | null,
  getPlaceholder: () => string,
) {
  return useMemo(
    () =>
      [
        ...markdownBaseExtensions,
        Placeholder.configure({
          placeholder: () => getPlaceholder(),
          emptyEditorClass: "is-editor-empty",
          showOnlyWhenEditable: true,
          showOnlyCurrent: false,
        }),
        createMarkdownSlashCommandExtension(getSlashConfig),
        createMarkdownMentionExtension(getMentionConfig),
      ] as unknown as Extensions,
    [getSlashConfig, getMentionConfig, getPlaceholder],
  );
}

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  disabled = false,
  className,
  placeholder,
  ariaLabel,
  chrome = "default",
  compact = false,
  mentionConfig = null,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Minimal inline chrome omits the bordered shell; toolbar still shows when editable. */
  chrome?: "default" | "minimal";
  /** Shorter min-height for single-line composers (e.g. comment reply footer). */
  compact?: boolean;
  mentionConfig?: MarkdownMentionConfig | null;
}) {
  const intl = useIntl();
  const rootRef = useRef<HTMLDivElement>(null);
  const blurCommitScheduledRef = useRef(false);
  const linkPromptOpenRef = useRef(false);
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const slashConfigRef = useRef<MarkdownSlashCommandConfig>({
    resolveItems: () => [],
    emptyLabel: "",
  });
  slashConfigRef.current = {
    resolveItems: (query: string) =>
      filterMarkdownSlashCommandItems(buildMarkdownSlashCommandItems(intl), query),
    emptyLabel: intl.formatMessage(markdownEditorMessages.slashEmpty),
  };
  const mentionConfigRef = useRef<MarkdownMentionConfig | null>(null);
  mentionConfigRef.current = mentionConfig;
  const getSlashConfig = useCallback(() => slashConfigRef.current, []);
  const getMentionConfig = useCallback(() => mentionConfigRef.current, []);
  const resolvedPlaceholder = placeholder ?? intl.formatMessage(markdownEditorMessages.placeholder);
  const placeholderRef = useRef(resolvedPlaceholder);
  placeholderRef.current = resolvedPlaceholder;
  const getPlaceholder = useCallback(() => placeholderRef.current, []);
  const editorExtensions = useMarkdownEditorExtensions(
    getSlashConfig,
    getMentionConfig,
    getPlaceholder,
  );
  const resolvedAriaLabel =
    ariaLabel ?? intl.formatMessage(markdownEditorMessages.taskDescriptionAria);
  const isMinimal = chrome === "minimal";
  const minimalMinHeightClassName = compact ? "min-h-6" : "min-h-[3rem]";
  const editorContentClassName = cn(
    isMinimal ? markdownEditorMinimalContentClassName : markdownEditorContentClassName,
    isMinimal ? minimalMinHeightClassName : "min-h-[8rem]",
  );

  const scheduleBlurCommit = useCallback((hasEditorFocus: () => boolean) => {
    // Root focusout and ProseMirror blur can both fire for one leave; coalesce.
    if (blurCommitScheduledRef.current) {
      return;
    }
    blurCommitScheduledRef.current = true;
    // Defer past slash/bubble menu mount/unmount so a transient body focus
    // during popup open doesn't commit, but a real outside click still does.
    queueMicrotask(() => {
      blurCommitScheduledRef.current = false;
      if (linkPromptOpenRef.current) {
        return;
      }
      if (hasEditorFocus()) {
        return;
      }
      const active = document.activeElement;
      if (rootRef.current?.contains(active)) {
        return;
      }
      if (isMarkdownEditorChromeTarget(active)) {
        return;
      }
      onBlurRef.current?.();
    });
  }, []);

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
      },
      handleDOMEvents: {
        blur: (_view) => {
          scheduleBlurCommit(() => _view.hasFocus());
          return false;
        },
      },
    },
  });

  const handleRootFocusOut = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    if (isMarkdownEditorChromeTarget(next)) {
      return;
    }
    scheduleBlurCommit(() => Boolean(editor?.view.hasFocus()));
  };

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

    // Placeholder text is read lazily; nudge decorations when it changes.
    editor.view.dispatch(editor.state.tr.setMeta("placeholder", resolvedPlaceholder));
  }, [editor, resolvedPlaceholder]);

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
        },
        handleDOMEvents: {
          blur: (_view) => {
            scheduleBlurCommit(() => editor.view.hasFocus());
            return false;
          },
        },
      },
    });
  }, [editor, editorContentClassName, resolvedAriaLabel, scheduleBlurCommit]);

  if (!editor) {
    return (
      <div
        className={cn(
          isMinimal
            ? minimalMinHeightClassName
            : "min-h-[8rem] rounded-lg border border-border bg-muted",
          !isMinimal && "resize-y overflow-auto",
          className,
        )}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      onBlur={handleRootFocusOut}
      className={cn(
        isMinimal
          ? compact
            ? "[&_.tiptap]:min-h-6"
            : "[&_.tiptap]:min-h-[3rem]"
          : "rounded-lg border border-border bg-muted [&_.tiptap]:min-h-[8rem]",
        markdownPlaceholderStyles,
        disabled && "opacity-60",
        className,
      )}
    >
      {!disabled && !isMinimal ? (
        <MarkdownEditorToolbar editor={editor} disabled={disabled} />
      ) : null}
      <EditorContent
        editor={editor}
        className={cn(
          isMinimal
            ? minimalMinHeightClassName
            : "max-h-[32rem] min-h-[8rem] resize-y overflow-auto",
        )}
      />
      {!disabled ? (
        <MarkdownEditorBubbleMenu
          editor={editor}
          onLinkPromptOpenChange={(open) => {
            linkPromptOpenRef.current = open;
          }}
        />
      ) : null}
    </div>
  );
}

export function MarkdownContent({
  value,
  className,
  contentClassName,
  ariaLabel,
  onMentionNavigate,
}: {
  value: string;
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
  onMentionNavigate?: (mention: ParsedMarkdownMention) => void;
}) {
  const intl = useIntl();
  const resolvedAriaLabel =
    ariaLabel ?? intl.formatMessage(markdownEditorMessages.markdownContentAria);
  const onMentionNavigateRef = useRef(onMentionNavigate);
  onMentionNavigateRef.current = onMentionNavigate;

  const editor = useEditor({
    extensions: markdownBaseExtensions,
    content: value,
    contentType: "markdown",
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(markdownEditorContentClassName, contentClassName),
        "aria-label": resolvedAriaLabel,
      },
      handleClick: (_view, _pos, event) =>
        tryHandleMentionClick(event, onMentionNavigateRef.current),
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
          class: cn(markdownEditorContentClassName, contentClassName),
          "aria-label": resolvedAriaLabel,
        },
        handleClick: (_view, _pos, event) =>
          tryHandleMentionClick(event, onMentionNavigateRef.current),
      },
    });
  }, [contentClassName, editor, resolvedAriaLabel]);

  // Non-editable TipTap skips Link click handling, so the browser follows
  // <a href="mention:…"> (often target=_blank). Capture before that happens.
  useEffect(() => {
    if (!editor) {
      return;
    }

    const dom = editor.view.dom;
    const onClick = (event: MouseEvent) => {
      tryHandleMentionClick(event, onMentionNavigateRef.current);
    };
    dom.addEventListener("click", onClick, true);
    return () => {
      dom.removeEventListener("click", onClick, true);
    };
  }, [editor]);

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

export function MarkdownPreview({
  value,
  className,
  contentClassName,
  emptyMessage,
  chrome = "default",
  onMentionNavigate,
}: {
  value: string;
  className?: string;
  contentClassName?: string;
  emptyMessage?: string;
  chrome?: "default" | "minimal";
  onMentionNavigate?: (mention: ParsedMarkdownMention) => void;
}) {
  const intl = useIntl();
  const resolvedEmptyMessage =
    emptyMessage ?? intl.formatMessage(markdownEditorMessages.noDescription);
  const previewAriaLabel = intl.formatMessage(markdownEditorMessages.taskDescriptionPreviewAria);
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
      onMentionNavigate={onMentionNavigate}
    />
  );
}
