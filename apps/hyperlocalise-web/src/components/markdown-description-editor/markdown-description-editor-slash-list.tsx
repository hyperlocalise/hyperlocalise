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
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { HugeiconsIcon } from "@hugeicons/react";

import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import {
  formatMarkdownSlashShortcut,
  type MarkdownSlashCommandItem,
} from "./markdown-description-editor-slash-items";

export type MarkdownSlashCommandListHandle = {
  onKeyDown: (event: globalThis.KeyboardEvent) => boolean;
};

type MarkdownSlashCommandListProps = {
  items: MarkdownSlashCommandItem[];
  emptyLabel: string;
  command: (item: MarkdownSlashCommandItem) => void;
};

export const MarkdownSlashCommandList = forwardRef<
  MarkdownSlashCommandListHandle,
  MarkdownSlashCommandListProps
>(function MarkdownSlashCommandList({ items, emptyLabel, command }, ref) {
  const isMac = useIsMac();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: globalThis.KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (items.length === 0) {
          return true;
        }
        setSelectedIndex((index) => (index + items.length - 1) % items.length);
        return true;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (items.length === 0) {
          return true;
        }
        setSelectedIndex((index) => (index + 1) % items.length);
        return true;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return true;
      }

      return false;
    },
  }));

  return (
    <div
      className="max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
      role="listbox"
    >
      {items.length === 0 ? (
        <p className="px-2.5 py-2 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        items.map((item, index) => {
          const shortcutLabel = item.shortcut
            ? formatMarkdownSlashShortcut(isMac, item.shortcut)
            : null;

          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm transition-colors",
                index === selectedIndex
                  ? "bg-muted text-foreground"
                  : "text-foreground hover:bg-muted/70",
              )}
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command(item)}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground">
                <HugeiconsIcon icon={item.icon} strokeWidth={1.8} className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium leading-5">{item.title}</span>
              {shortcutLabel ? (
                <span className="shrink-0 font-mono text-[11px] tracking-wide text-muted-foreground">
                  {shortcutLabel}
                </span>
              ) : null}
            </button>
          );
        })
      )}
    </div>
  );
});

export function createMarkdownSlashCommandSuggestionRender(getEmptyLabel: () => string) {
  let root: Root | null = null;
  let listHandle: MarkdownSlashCommandListHandle | null = null;
  let unmountFloating: (() => void) | null = null;
  let popupElement: HTMLElement | null = null;

  const renderList = (props: {
    items: MarkdownSlashCommandItem[];
    command: (item: MarkdownSlashCommandItem) => void;
  }) => {
    if (!root) {
      return;
    }

    root.render(
      <MarkdownSlashCommandList
        ref={(instance) => {
          listHandle = instance;
        }}
        items={props.items}
        emptyLabel={getEmptyLabel()}
        command={props.command}
      />,
    );
  };

  return () => ({
    onStart: (props: SuggestionProps<MarkdownSlashCommandItem, MarkdownSlashCommandItem>) => {
      const element = document.createElement("div");
      element.dataset.markdownSlashMenu = "true";
      // Sheet/Dialog use z-50; keep the menu above those surfaces.
      element.style.zIndex = "100";
      popupElement = element;
      root = createRoot(element);
      renderList({
        items: props.items,
        command: (item) => props.command(item),
      });
      unmountFloating = props.mount(element);
    },
    onUpdate: (props: SuggestionProps<MarkdownSlashCommandItem, MarkdownSlashCommandItem>) => {
      renderList({
        items: props.items,
        command: (item) => props.command(item),
      });
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === "Escape") {
        return true;
      }
      return listHandle?.onKeyDown(props.event) ?? false;
    },
    onExit: () => {
      unmountFloating?.();
      unmountFloating = null;
      // Defer unmount so TipTap can finish the current transaction.
      const activeRoot = root;
      const activeElement = popupElement;
      root = null;
      popupElement = null;
      listHandle = null;
      queueMicrotask(() => {
        activeRoot?.unmount();
        activeElement?.remove();
      });
    },
  });
}
