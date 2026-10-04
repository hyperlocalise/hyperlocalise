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
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { documentEditorMessages as messages } from "./document-editor.messages";

const ACTIVE_HEADING_OFFSET_PX = 120;
const MIN_OUTLINE_HEADINGS = 2;
const TICK_WIDTH_BY_LEVEL: Record<number, string> = {
  1: "w-5",
  2: "w-5",
  3: "w-3.5",
  4: "w-2",
};
const INDENT_BY_LEVEL: Record<number, string> = {
  1: "ps-0",
  2: "ps-0",
  3: "ps-3",
  4: "ps-6",
};

export type DocumentOutlineEntry = {
  pos: number;
  blockIndex: number;
  level: number;
  text: string;
  flagged: boolean;
};

function readOutline(editor: Editor, flaggedBlocks: ReadonlySet<number>): DocumentOutlineEntry[] {
  const headings: Omit<DocumentOutlineEntry, "flagged">[] = [];
  editor.state.doc.forEach((node, offset, index) => {
    if (node.type.name !== "heading") return;
    const text = node.textContent.trim();
    if (!text) return;
    headings.push({ pos: offset, blockIndex: index, level: Number(node.attrs.level) || 1, text });
  });
  const blockCount = editor.state.doc.childCount;
  return headings.map((heading, index) => {
    const end = headings[index + 1]?.blockIndex ?? blockCount;
    let flagged = false;
    for (let block = heading.blockIndex; block < end && !flagged; block += 1) {
      flagged = flaggedBlocks.has(block);
    }
    return { ...heading, flagged };
  });
}

function sameOutline(a: DocumentOutlineEntry[], b: DocumentOutlineEntry[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (entry, index) =>
      entry.pos === b[index].pos &&
      entry.text === b[index].text &&
      entry.level === b[index].level &&
      entry.flagged === b[index].flagged,
  );
}

function headingElement(editor: Editor, pos: number): HTMLElement | null {
  if (editor.isDestroyed) return null;
  const dom = editor.view.nodeDOM(pos);
  return dom instanceof HTMLElement ? dom : null;
}

const EMPTY_FLAGGED = new Set<number>();

export function DocumentEditorOutline({
  editor,
  flaggedBlocks = EMPTY_FLAGGED,
  className,
}: {
  editor: Editor;
  flaggedBlocks?: ReadonlySet<number>;
  className?: string;
}) {
  const intl = useIntl();
  const outline = useEditorState({
    editor,
    selector: ({ editor: current }) => readOutline(current, flaggedBlocks),
    equalityFn: (a, b) => (a && b ? sameOutline(a, b) : a === b),
  });
  const [activePos, setActivePos] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [hoveredPos, setHoveredPos] = useState<number | null>(null);

  useEffect(() => {
    if (outline.length === 0) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let current: number | null = outline[0].pos;
        for (const entry of outline) {
          const element = headingElement(editor, entry.pos);
          if (!element) continue;
          if (element.getBoundingClientRect().top - ACTIVE_HEADING_OFFSET_PX <= 0) {
            current = entry.pos;
          } else {
            break;
          }
        }
        setActivePos(current);
      });
    };
    update();
    document.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [editor, outline]);

  if (outline.length < MIN_OUTLINE_HEADINGS) return null;

  const scrollTo = (pos: number) => {
    headingElement(editor, pos)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActivePos(pos);
  };

  return (
    <nav
      aria-label={intl.formatMessage(messages.outline)}
      data-document-outline=""
      className={cn("relative", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false);
        setHoveredPos(null);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          (event.target as HTMLElement).blur();
        }
      }}
    >
      <ol className="flex flex-col items-end gap-2 py-2 ps-3">
        {outline.map((entry) => {
          const active = entry.pos === activePos;
          return (
            <li key={entry.pos} className="flex">
              <button
                type="button"
                aria-label={entry.text}
                aria-current={active ? "location" : undefined}
                className="flex h-1.5 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onMouseEnter={() => setHoveredPos(entry.pos)}
                onClick={() => scrollTo(entry.pos)}
              >
                <span
                  className={cn(
                    "block h-0.5 rounded-full transition-colors",
                    TICK_WIDTH_BY_LEVEL[entry.level] ?? "w-2",
                    active
                      ? "bg-foreground"
                      : entry.flagged
                        ? "bg-amber-500/80"
                        : "bg-muted-foreground/35",
                    hoveredPos === entry.pos && !active && "bg-muted-foreground",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>
      {open ? (
        <div
          className="absolute end-full top-0 z-30 me-1 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
          role="presentation"
        >
          <ul className="flex flex-col">
            {outline.map((entry) => {
              const active = entry.pos === activePos;
              return (
                <li key={entry.pos} className={INDENT_BY_LEVEL[entry.level] ?? "ps-6"}>
                  <button
                    type="button"
                    tabIndex={-1}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-start text-[13px] leading-5 transition-colors",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      hoveredPos === entry.pos && !active && "bg-muted/60 text-foreground",
                    )}
                    onMouseEnter={() => setHoveredPos(entry.pos)}
                    onClick={() => scrollTo(entry.pos)}
                  >
                    <span className="min-w-0 flex-1 truncate">{entry.text}</span>
                    {entry.flagged ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-amber-500"
                        title={intl.formatMessage(messages.outlineUntranslated)}
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
