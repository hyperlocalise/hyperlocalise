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
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { CheckmarkCircle02Icon, Clock01Icon, CircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/primitives/cn";

import type { MarkdownMentionSuggestion } from "./markdown-editor-mention-types";

export type MarkdownMentionListHandle = {
  onKeyDown: (event: globalThis.KeyboardEvent) => boolean;
};

type MarkdownMentionListProps = {
  items: MarkdownMentionSuggestion[];
  emptyLabel: string;
  usersSectionLabel: string;
  issuesSectionLabel: string;
  command: (item: MarkdownMentionSuggestion) => void;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function IssueStatusIcon({ status }: { status: string }) {
  if (status === "in_progress") {
    return (
      <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.8} className="size-3.5 text-amber-500" />
    );
  }
  if (status === "resolved" || status === "wont_fix") {
    return (
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        strokeWidth={1.8}
        className="size-3.5 text-violet-500"
      />
    );
  }
  return (
    <HugeiconsIcon icon={CircleIcon} strokeWidth={1.8} className="size-3.5 text-muted-foreground" />
  );
}

export const MarkdownMentionList = forwardRef<MarkdownMentionListHandle, MarkdownMentionListProps>(
  function MarkdownMentionList(
    { items, emptyLabel, usersSectionLabel, issuesSectionLabel, command },
    ref,
  ) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const users = useMemo(() => items.filter((item) => item.kind === "user"), [items]);
    const issues = useMemo(() => items.filter((item) => item.kind === "issue"), [items]);

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

        if (event.key === "Enter" || event.key === "Tab") {
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

    function renderItem(item: MarkdownMentionSuggestion, index: number) {
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
          {item.kind === "user" ? (
            <>
              <Avatar size="sm" className="size-6">
                {item.avatarUrl ? <AvatarImage src={item.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-[10px]">
                  {initials(item.displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate font-medium leading-5">
                {item.displayName}
              </span>
              {item.isAgent ? (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  Agent
                </Badge>
              ) : null}
            </>
          ) : (
            <>
              <span className="flex size-6 shrink-0 items-center justify-center">
                <IssueStatusIcon status={item.status} />
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {item.displayKey}
              </span>
              <span className="min-w-0 flex-1 truncate leading-5">{item.title}</span>
            </>
          )}
        </button>
      );
    }

    let runningIndex = 0;

    return (
      <div
        className="max-h-80 w-80 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
        role="listbox"
        data-markdown-mention-menu=""
      >
        {items.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <>
            {users.length > 0 ? (
              <div className="mb-1">
                <p className="px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {usersSectionLabel}
                </p>
                {users.map((item) => {
                  const index = runningIndex;
                  runningIndex += 1;
                  return renderItem(item, index);
                })}
              </div>
            ) : null}
            {issues.length > 0 ? (
              <div>
                <p className="px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {issuesSectionLabel}
                </p>
                {issues.map((item) => {
                  const index = runningIndex;
                  runningIndex += 1;
                  return renderItem(item, index);
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  },
);

export function createMarkdownMentionSuggestionRender(
  getLabels: () => {
    emptyLabel: string;
    usersSectionLabel: string;
    issuesSectionLabel: string;
  },
) {
  let root: Root | null = null;
  let listHandle: MarkdownMentionListHandle | null = null;
  let unmountFloating: (() => void) | null = null;
  let popupElement: HTMLElement | null = null;

  const renderList = (props: {
    items: MarkdownMentionSuggestion[];
    command: (item: MarkdownMentionSuggestion) => void;
  }) => {
    if (!root) {
      return;
    }
    const labels = getLabels();
    root.render(
      <MarkdownMentionList
        ref={(instance) => {
          listHandle = instance;
        }}
        items={props.items}
        emptyLabel={labels.emptyLabel}
        usersSectionLabel={labels.usersSectionLabel}
        issuesSectionLabel={labels.issuesSectionLabel}
        command={props.command}
      />,
    );
  };

  return () => ({
    onStart: (props: SuggestionProps<MarkdownMentionSuggestion, MarkdownMentionSuggestion>) => {
      const element = document.createElement("div");
      element.dataset.markdownMentionMenu = "true";
      element.style.zIndex = "100";
      popupElement = element;
      root = createRoot(element);
      renderList({
        items: props.items,
        command: (item) => props.command(item),
      });
      unmountFloating = props.mount(element);
    },
    onUpdate: (props: SuggestionProps<MarkdownMentionSuggestion, MarkdownMentionSuggestion>) => {
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
