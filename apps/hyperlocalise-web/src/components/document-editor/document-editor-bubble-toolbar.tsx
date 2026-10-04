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
import {
  BookOpenTextIcon,
  CaretDownIcon,
  CheckIcon,
  CodeIcon,
  LinkIcon,
  TextBIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { createElement, useState } from "react";
import { useIntl } from "react-intl";

import { MarkdownSelectionAi } from "@/components/markdown-editor/markdown-selection-ai";
import type { MarkdownSelectionAiConfig } from "@/components/markdown-editor/markdown-selection-ai.types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/primitives/cn";

import { activeDocumentBlockType, DOCUMENT_BLOCK_TYPES } from "./document-editor-block-types";
import { documentEditorMessages as messages } from "./document-editor.messages";

function keepSelection(event: React.MouseEvent) {
  event.preventDefault();
}

function ToolbarButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: Icon;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "size-7 rounded-md p-0 text-muted-foreground hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
      onMouseDown={keepSelection}
      onClick={onClick}
    >
      {createElement(icon, { className: "size-3.5", weight: active ? "bold" : "regular" })}
    </Button>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-4 w-px bg-border" aria-hidden />;
}

export function DocumentEditorBubbleToolbar({
  editor,
  selectionAi,
  onAddToGlossary,
}: {
  editor: Editor;
  selectionAi?: MarkdownSelectionAiConfig;
  onAddToGlossary?: (text: string) => void;
}) {
  const intl = useIntl();
  const [askOpen, setAskOpen] = useState(false);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      blockTypeId: activeDocumentBlockType(current).id,
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      link: current.isActive("link"),
    }),
  });
  const activeType =
    DOCUMENT_BLOCK_TYPES.find((type) => type.id === state.blockTypeId) ?? DOCUMENT_BLOCK_TYPES[0];

  const toggleLink = () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const previous = editor.getAttributes("link").href;
    const url = window.prompt(
      intl.formatMessage(messages.linkPrompt),
      typeof previous === "string" ? previous : "https://",
    );
    if (url === null) {
      editor.commands.focus();
      return;
    }
    const href = url.trim();
    if (href === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: activeEditor, state: editorState }) => {
        if (!activeEditor.isEditable) return false;
        if (askOpen || blockMenuOpen) return true;
        const { selection } = editorState;
        if (selection.empty || activeEditor.isActive("codeBlock")) return false;
        return !("node" in selection);
      }}
    >
      <div
        data-document-bubble-toolbar=""
        className="flex items-center gap-0.5 rounded-xl border border-border bg-popover p-1 shadow-lg"
      >
        <DropdownMenu open={blockMenuOpen} onOpenChange={setBlockMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-7 gap-1 rounded-md px-2 text-muted-foreground hover:text-foreground"
                onMouseDown={keepSelection}
                aria-label={intl.formatMessage(messages.blockTypePicker)}
              />
            }
          >
            {intl.formatMessage(activeType.label)}
            <CaretDownIcon className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {DOCUMENT_BLOCK_TYPES.map((type) => (
              <DropdownMenuItem key={type.id} onClick={() => type.apply(editor)}>
                {createElement(type.icon, { className: "size-4" })}
                <span className="flex-1">{intl.formatMessage(type.label)}</span>
                {type.id === activeType.id ? <CheckIcon className="size-3.5" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <ToolbarDivider />
        <ToolbarButton
          active={state.bold}
          label={intl.formatMessage(messages.bold)}
          icon={TextBIcon}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          active={state.italic}
          label={intl.formatMessage(messages.italic)}
          icon={TextItalicIcon}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          active={state.strike}
          label={intl.formatMessage(messages.strike)}
          icon={TextStrikethroughIcon}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          active={state.code}
          label={intl.formatMessage(messages.inlineCode)}
          icon={CodeIcon}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ToolbarButton
          active={state.link}
          label={intl.formatMessage(messages.link)}
          icon={LinkIcon}
          onClick={toggleLink}
        />
        {onAddToGlossary ? (
          <>
            <ToolbarDivider />
            <ToolbarButton
              active={false}
              label={intl.formatMessage(messages.addToGlossary)}
              icon={BookOpenTextIcon}
              onClick={() => {
                const { from, to } = editor.state.selection;
                const text = editor.state.doc.textBetween(from, to, " ").trim();
                if (text) onAddToGlossary(text);
              }}
            />
          </>
        ) : null}
        {selectionAi ? (
          <>
            <ToolbarDivider />
            <MarkdownSelectionAi
              editor={editor}
              config={selectionAi}
              open={askOpen}
              onOpenChange={setAskOpen}
            />
          </>
        ) : null}
      </div>
    </BubbleMenu>
  );
}
