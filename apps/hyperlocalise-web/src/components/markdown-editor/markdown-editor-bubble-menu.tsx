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
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Link01Icon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { markdownEditorMessages } from "./markdown-editor.messages";

function BubbleMenuButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: IconSvgElement;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "size-7 rounded-md p-0 text-muted-foreground hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
      onMouseDown={(event) => {
        // Keep the editor selection while clicking the bubble control.
        event.preventDefault();
      }}
      onClick={onClick}
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-3.5" />
    </Button>
  );
}

export function MarkdownEditorBubbleMenu({
  editor,
  onLinkPromptOpenChange,
}: {
  editor: Editor;
  onLinkPromptOpenChange?: (open: boolean) => void;
}) {
  const intl = useIntl();
  const linkPrompt = intl.formatMessage(markdownEditorMessages.linkPrompt);

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: activeEditor, state }) => {
        const { empty } = state.selection;
        return activeEditor.isEditable && !empty && !activeEditor.isActive("codeBlock");
      }}
    >
      <div
        data-markdown-bubble-menu=""
        className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md"
      >
        <BubbleMenuButton
          active={editor.isActive("bold")}
          label={intl.formatMessage(markdownEditorMessages.bubbleBold)}
          icon={TextBoldIcon}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <BubbleMenuButton
          active={editor.isActive("italic")}
          label={intl.formatMessage(markdownEditorMessages.bubbleItalic)}
          icon={TextItalicIcon}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <BubbleMenuButton
          active={editor.isActive("strike")}
          label={intl.formatMessage(markdownEditorMessages.bubbleStrike)}
          icon={TextStrikethroughIcon}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <BubbleMenuButton
          active={editor.isActive("code")}
          label={intl.formatMessage(markdownEditorMessages.bubbleCode)}
          icon={SourceCodeIcon}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <div className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <BubbleMenuButton
          active={editor.isActive("link")}
          label={intl.formatMessage(markdownEditorMessages.bubbleLink)}
          icon={Link01Icon}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }

            const previousUrl = editor.getAttributes("link").href;
            onLinkPromptOpenChange?.(true);
            try {
              const url = window.prompt(
                linkPrompt,
                typeof previousUrl === "string" ? previousUrl : "https://",
              );
              if (url === null) {
                return;
              }
              if (url.trim() === "") {
                editor.chain().focus().unsetLink().run();
                return;
              }
              editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
            } finally {
              editor.commands.focus();
              queueMicrotask(() => onLinkPromptOpenChange?.(false));
            }
          }}
        />
      </div>
    </BubbleMenu>
  );
}
