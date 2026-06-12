"use client";

import { useEffect } from "react";
import { EditorContent, type Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import type { Extensions } from "@tiptap/core";

import { cn } from "@/lib/primitives/cn";

const markdownDescriptionContentClassName = cn(
  "max-w-none px-3 py-2 text-sm text-foreground/74 focus:outline-none",
  "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:font-heading [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-foreground",
  "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-foreground",
  "[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-heading [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-foreground",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-1 [&_li>p]:my-0",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-foreground/16 [&_blockquote]:pl-3 [&_blockquote]:text-foreground/62",
  "[&_a]:text-foreground [&_a]:underline [&_a]:decoration-foreground/24 [&_a]:underline-offset-4 [&_a:hover]:decoration-foreground/48",
  "[&_code]:rounded [&_code]:bg-foreground/8 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-foreground/8 [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
);

type MarkdownCommandChain = ReturnType<Editor["chain"]> & {
  toggleBold: () => MarkdownCommandChain;
  toggleItalic: () => MarkdownCommandChain;
  toggleHeading: (attributes: { level: 2 | 3 }) => MarkdownCommandChain;
  toggleBlockquote: () => MarkdownCommandChain;
  toggleCode: () => MarkdownCommandChain;
};

const markdownExtensions = [StarterKit, Markdown] as unknown as Extensions;

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
        event.preventDefault();
        onClick();
      }}
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded border border-transparent px-2 text-xs font-medium text-foreground/62 transition-colors",
        "hover:border-foreground/10 hover:bg-foreground/5 hover:text-foreground",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        pressed && "border-foreground/12 bg-foreground/8 text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function MarkdownDescriptionToolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const isDisabled = disabled || !editor.isEditable;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-foreground/8 bg-foreground/2 px-2 py-1.5">
      <MarkdownToolbarButton
        label="B"
        title="Bold"
        pressed={editor.isActive("bold")}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleBold().run()}
      />
      <MarkdownToolbarButton
        label="I"
        title="Italic"
        pressed={editor.isActive("italic")}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleItalic().run()}
      />
      <MarkdownToolbarButton
        label="H2"
        title="Heading 2"
        pressed={editor.isActive("heading", { level: 2 })}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleHeading({ level: 2 }).run()}
      />
      <MarkdownToolbarButton
        label="H3"
        title="Heading 3"
        pressed={editor.isActive("heading", { level: 3 })}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleHeading({ level: 3 }).run()}
      />
      <MarkdownToolbarButton
        label="• List"
        title="Bullet list"
        pressed={editor.isActive("bulletList")}
        disabled={isDisabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <MarkdownToolbarButton
        label="1. List"
        title="Numbered list"
        pressed={editor.isActive("orderedList")}
        disabled={isDisabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <MarkdownToolbarButton
        label="Quote"
        title="Blockquote"
        pressed={editor.isActive("blockquote")}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleBlockquote().run()}
      />
      <MarkdownToolbarButton
        label="Code"
        title="Inline code"
        pressed={editor.isActive("code")}
        disabled={isDisabled}
        onClick={() => markdownCommandChain(editor).toggleCode().run()}
      />
    </div>
  );
}

export function MarkdownDescriptionEditor({
  value,
  onChange,
  disabled = false,
  className,
  placeholder = "Add a description…",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: markdownExtensions,
    content: value,
    contentType: "markdown",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: activeEditor }) => {
      onChange(activeEditor.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: cn(markdownDescriptionContentClassName, "min-h-[8rem]"),
        "aria-label": "Task description",
        "data-placeholder": placeholder,
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

  if (!editor) {
    return (
      <div
        className={cn(
          "min-h-[8rem] rounded-lg border border-foreground/12 bg-foreground/2.5",
          "resize-y overflow-auto",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-foreground/12 bg-foreground/2.5",
        "[&_.tiptap]:min-h-[8rem]",
        "[&_.tiptap_p.is-editor-empty:first-child::before]:text-foreground/34",
        "[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        "[&_.tiptap_p.is-editor-empty:first-child::before]:float-left",
        "[&_.tiptap_p.is-editor-empty:first-child::before]:h-0",
        "[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <MarkdownDescriptionToolbar editor={editor} disabled={disabled} />
      <EditorContent
        editor={editor}
        className="max-h-[32rem] min-h-[8rem] resize-y overflow-auto"
      />
    </div>
  );
}

export function MarkdownContent({
  value,
  className,
  contentClassName,
  ariaLabel = "Markdown content",
}: {
  value: string;
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
}) {
  const editor = useEditor({
    extensions: markdownExtensions,
    content: value,
    contentType: "markdown",
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(markdownDescriptionContentClassName, contentClassName),
        "aria-label": ariaLabel,
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

  if (!editor) {
    return <div className={className} />;
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
  emptyMessage = "No description",
}: {
  value: string;
  className?: string;
  contentClassName?: string;
  emptyMessage?: string;
}) {
  if (!value.trim()) {
    return (
      <div
        className={cn(
          "rounded-lg border border-foreground/8 bg-foreground/2.5 px-3 py-2 text-sm text-foreground/42",
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <MarkdownContent
      value={value}
      className={cn("rounded-lg border border-foreground/8 bg-foreground/2.5", className)}
      contentClassName={cn("min-h-[5rem]", contentClassName)}
      ariaLabel="Task description preview"
    />
  );
}
