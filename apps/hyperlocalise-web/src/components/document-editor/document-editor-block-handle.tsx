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
  CopyIcon,
  DotsSixVerticalIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { createElement, useEffect, useRef, useState, type RefObject } from "react";
import { useIntl } from "react-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { DOCUMENT_BLOCK_TYPES } from "./document-editor-block-types";
import { documentEditorMessages as messages } from "./document-editor.messages";

const HANDLE_HEIGHT_PX = 24;
const CONTENT_PROBE_OFFSET_PX = 24;

type HoveredBlock = { pos: number; top: number };

function topLevelBlockAt(editor: Editor, clientY: number): number | null {
  const view = editor.view;
  const rect = view.dom.getBoundingClientRect();
  if (clientY < rect.top || clientY > rect.bottom) return null;
  const hit = view.posAtCoords({ left: rect.left + CONTENT_PROBE_OFFSET_PX, top: clientY });
  if (!hit) return null;
  const doc = view.state.doc;
  const anchor = hit.inside >= 0 ? hit.inside : hit.pos;
  const $pos = doc.resolve(Math.min(anchor, doc.content.size));
  if ($pos.depth >= 1) return $pos.before(1);
  return doc.nodeAt(anchor) ? anchor : null;
}

function blockOffsetTop(editor: Editor, pos: number, container: HTMLElement): number | null {
  const dom = editor.view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  const blockRect = dom.getBoundingClientRect();
  const style = window.getComputedStyle(dom);
  const lineHeight = Number.parseFloat(style.lineHeight) || HANDLE_HEIGHT_PX;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  return (
    blockRect.top -
    container.getBoundingClientRect().top +
    paddingTop +
    Math.max(0, (lineHeight - HANDLE_HEIGHT_PX) / 2)
  );
}

export function DocumentEditorBlockHandle({
  editor,
  containerRef,
  onTranslateBlock,
}: {
  editor: Editor;
  containerRef: RefObject<HTMLElement | null>;
  onTranslateBlock?: (blockPos: number) => void;
}) {
  const intl = useIntl();
  const [hovered, setHovered] = useState<HoveredBlock | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    const onMove = (event: MouseEvent) => {
      if (menuOpenRef.current || !editor.isEditable) return;
      const clientY = event.clientY;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        const pos = topLevelBlockAt(editor, clientY);
        const top = pos === null ? null : blockOffsetTop(editor, pos, container);
        setHovered((current) => {
          if (pos === null || top === null) return null;
          if (current?.pos === pos && current.top === top) return current;
          return { pos, top };
        });
      });
    };
    const onLeave = () => {
      if (!menuOpenRef.current) setHovered(null);
    };
    const onEdit = () => {
      if (!menuOpenRef.current) setHovered(null);
    };
    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", onLeave);
    editor.on("update", onEdit);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", onLeave);
      editor.off("update", onEdit);
    };
  }, [containerRef, editor]);

  if (!hovered || !editor.isEditable) return null;
  const blockPos = hovered.pos;
  const blockNode = editor.state.doc.nodeAt(blockPos);
  if (!blockNode) return null;

  const focusBlock = () => {
    const { state, view } = editor;
    const $inside = state.doc.resolve(Math.min(blockPos + 1, state.doc.content.size));
    view.dispatch(state.tr.setSelection(TextSelection.near($inside)));
    view.focus();
  };

  const addBelow = () => {
    const isEmptyParagraph = blockNode.type.name === "paragraph" && blockNode.content.size === 0;
    if (isEmptyParagraph) {
      editor
        .chain()
        .focus()
        .setTextSelection(blockPos + 1)
        .insertContent("/")
        .run();
      return;
    }
    const insertAt = blockPos + blockNode.nodeSize;
    editor
      .chain()
      .focus()
      .insertContentAt(insertAt, { type: "paragraph" })
      .setTextSelection(insertAt + 1)
      .insertContent("/")
      .run();
  };

  const startDrag = (event: React.DragEvent) => {
    const { view } = editor;
    const selection = NodeSelection.create(view.state.doc, blockPos);
    view.dispatch(view.state.tr.setSelection(selection));
    view.dragging = { slice: selection.content(), move: true };
    const dom = view.nodeDOM(blockPos);
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", blockNode.textContent);
    if (dom instanceof HTMLElement) {
      event.dataTransfer.setDragImage(dom, 0, 0);
    }
  };

  const duplicate = () => {
    editor
      .chain()
      .focus()
      .insertContentAt(blockPos + blockNode.nodeSize, blockNode.toJSON())
      .run();
  };

  const remove = () => {
    editor
      .chain()
      .focus()
      .deleteRange({ from: blockPos, to: blockPos + blockNode.nodeSize })
      .run();
    setHovered(null);
  };

  const buttonClass =
    "flex h-6 w-5 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground";

  return (
    <div
      contentEditable={false}
      data-document-block-handle=""
      className="absolute left-0 z-10 flex items-center gap-0.5 transition-[top] duration-75"
      style={{ top: hovered.top }}
    >
      <button
        type="button"
        className={buttonClass}
        aria-label={intl.formatMessage(messages.addBlock)}
        title={intl.formatMessage(messages.addBlock)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={addBelow}
      >
        <PlusIcon className="size-3.5" />
      </button>
      <div className="relative">
        <button
          type="button"
          draggable
          className={`${buttonClass} cursor-grab active:cursor-grabbing`}
          aria-label={intl.formatMessage(messages.blockMenu)}
          title={intl.formatMessage(messages.blockMenu)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onMouseDown={(event) => event.preventDefault()}
          onDragStart={startDrag}
          onClick={() => setMenuOpen(true)}
        >
          <DotsSixVerticalIcon className="size-4" weight="bold" />
        </button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={<span aria-hidden className="pointer-events-none absolute inset-0" />}
          />
          <DropdownMenuContent align="start" side="left" className="w-56">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {intl.formatMessage(messages.turnInto)}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {DOCUMENT_BLOCK_TYPES.map((type) => (
                  <DropdownMenuItem
                    key={type.id}
                    onClick={() => {
                      focusBlock();
                      type.apply(editor);
                    }}
                  >
                    {createElement(type.icon, { className: "size-4" })}
                    {intl.formatMessage(type.label)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {onTranslateBlock ? (
              <DropdownMenuItem onClick={() => onTranslateBlock(blockPos)}>
                <SparkleIcon className="size-4" />
                {intl.formatMessage(messages.translateBlock)}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={duplicate}>
              <CopyIcon className="size-4" />
              {intl.formatMessage(messages.duplicate)}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={remove}>
              <TrashIcon className="size-4" />
              {intl.formatMessage(messages.delete)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
