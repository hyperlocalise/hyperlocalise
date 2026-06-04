"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";

import { cn } from "@/lib/primitives/cn";

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
    extensions: [StarterKit, Markdown],
    content: value,
    contentType: "markdown",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: activeEditor }) => {
      onChange(activeEditor.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none min-h-[8rem] px-3 py-2 focus:outline-none",
          "prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2",
        ),
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
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-foreground/12 bg-foreground/2.5",
        "[&_.tiptap]:min-h-[8rem] [&_.tiptap]:text-sm [&_.tiptap]:text-foreground/74",
        "[&_.tiptap_p.is-editor-empty:first-child::before]:text-foreground/34",
        "[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        "[&_.tiptap_p.is-editor-empty:first-child::before]:float-left",
        "[&_.tiptap_p.is-editor-empty:first-child::before]:h-0",
        "[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
