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
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { TagIcon, XIcon } from "@phosphor-icons/react";
import { useIntl } from "react-intl";

import { fetchProjectFileContentEditorLabels } from "@/components/content-editor/project-file/project-file-content-editor-api";
import { cn } from "@/lib/primitives/cn";
import {
  isValidLabelId,
  withIncludedTag,
  withoutIncludedTag,
  type ContentEditorAdvancedQueueFilter,
} from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";

import { contentEditorTagSearchMessages as messages } from "./content-editor-tag-search.messages";

const maxSuggestions = 8;
const tagTokenPattern = /(^|\s)tag:([A-Za-z0-9_-]{1,64})(?=\s)/gi;
const pendingTokenPattern = /(^|\s)(tag:\S*)$/i;

/**
 * Splits search text into the plain text, the tags of finished `tag:` words (followed by a space)
 * and an unfinished `tag:` word at the end, which is still being typed.
 */
export function parseTagSearch(value: string): {
  text: string;
  tags: string[];
  pending: string | null;
} {
  const tags: string[] = [];
  const replaced = value.replace(tagTokenPattern, (_match, before: string, tag: string) => {
    tags.push(tag);
    return before;
  });
  // Removing a word can leave two spaces where it was.
  const text = tags.length > 0 ? replaced.replace(/\s{2,}/g, " ") : replaced;
  const pending = pendingTokenPattern.exec(text);
  if (!pending) {
    return { text, tags, pending: null };
  }
  return {
    text: text.slice(0, text.length - pending[2].length),
    tags,
    pending: pending[2].slice("tag:".length),
  };
}

/**
 * `tag:` words in the content editor's search box: they become the tag filter, shown as chips,
 * with the project's tags suggested while one is typed. Off, the box searches text only.
 */
export function useContentEditorTagSearch({
  enabled,
  search,
  onSearchChange,
  queueAdvanced,
  onQueueAdvancedChange,
  organizationSlug,
  projectId,
}: {
  enabled: boolean;
  search: string;
  onSearchChange?: (value: string) => void;
  queueAdvanced?: ContentEditorAdvancedQueueFilter;
  onQueueAdvancedChange?: (filter: ContentEditorAdvancedQueueFilter | undefined) => void;
  organizationSlug?: string;
  projectId?: string;
}) {
  const intl = useIntl();
  const listboxId = useId();
  // The unfinished `tag:` word; kept out of the text search so it doesn't search for "tag:re".
  const [pending, setPending] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const active = enabled && Boolean(onSearchChange && onQueueAdvancedChange);
  const chosenTags = useMemo(() => queueAdvanced?.includeLabelIds ?? [], [queueAdvanced]);

  const labelsQuery = useQuery({
    queryKey: ["content-editor-cat-labels", organizationSlug, projectId],
    queryFn: () =>
      fetchProjectFileContentEditorLabels({
        organizationSlug: organizationSlug!,
        projectId: projectId!,
        intl,
      }),
    // Loaded with the editor, so suggestions are ready when `tag:` is typed.
    enabled: active && Boolean(organizationSlug && projectId),
    staleTime: 60_000,
  });

  const suggestions = useMemo(() => {
    if (pending === null) {
      return [];
    }
    const prefix = pending.toLowerCase();
    return (labelsQuery.data ?? [])
      .map((label) => label.id)
      .filter((tag) => !chosenTags.includes(tag) && tag.toLowerCase().startsWith(prefix))
      .sort((a, b) => Number(b.toLowerCase() === prefix) - Number(a.toLowerCase() === prefix))
      .slice(0, maxSuggestions);
  }, [chosenTags, labelsQuery.data, pending]);

  function addTags(tags: string[], filter = queueAdvanced) {
    let next = filter;
    for (const tag of tags) {
      next = withIncludedTag(next, tag);
    }
    onQueueAdvancedChange?.(next);
  }

  function choose(tag: string) {
    setPending(null);
    setHighlight(0);
    addTags([tag]);
  }

  function onInputChange(value: string) {
    if (!active) {
      onSearchChange?.(value);
      return;
    }
    const parsed = parseTagSearch(value);
    if (parsed.tags.length > 0) {
      addTags(parsed.tags.filter(isValidLabelId));
    }
    setPending(parsed.pending);
    setHighlight(0);
    setDismissed(false);
    if (parsed.text !== search) {
      onSearchChange?.(parsed.text);
    }
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!active) {
      return;
    }
    // Backspace in an empty box takes off the last tag, as in other token fields.
    if (
      event.key === "Backspace" &&
      pending === null &&
      search === "" &&
      event.currentTarget.selectionStart === 0 &&
      chosenTags.length > 0
    ) {
      event.preventDefault();
      onQueueAdvancedChange?.(withoutIncludedTag(queueAdvanced, chosenTags[chosenTags.length - 1]));
      return;
    }
    if (pending === null) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length > 0) {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlight((current) => (current + step + suggestions.length) % suggestions.length);
        setDismissed(false);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Until the tags arrive, Enter would take the typed start of a tag as a whole one.
      if (labelsQuery.isPending) {
        return;
      }
      const picked = !dismissed ? suggestions[highlight] : undefined;
      if (picked) {
        choose(picked);
      } else if (isValidLabelId(pending)) {
        choose(pending);
      }
    } else if (event.key === "Escape" && !dismissed) {
      event.preventDefault();
      setDismissed(true);
    }
  }

  const open = active && pending !== null && !dismissed;
  const activeOption = open && suggestions[highlight] ? `${listboxId}-${highlight}` : undefined;

  return {
    active,
    hasTags: active && chosenTags.length > 0,
    inputValue: active && pending !== null ? `${search}tag:${pending}` : search,
    onInputChange,
    onInputKeyDown,
    inputProps: active
      ? {
          role: "combobox" as const,
          "aria-autocomplete": "list" as const,
          "aria-expanded": open,
          "aria-controls": open ? listboxId : undefined,
          "aria-activedescendant": activeOption,
        }
      : {},
    suggestions: open ? (
      <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-48 rounded-md border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md">
        {suggestions.length > 0 ? (
          <ul id={listboxId} role="listbox" aria-label={intl.formatMessage(messages.suggestions)}>
            {suggestions.map((tag, index) => (
              <li
                key={tag}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === highlight}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1.5 font-mono",
                  index === highlight && "bg-accent text-accent-foreground",
                )}
                onMouseDown={(event) => {
                  // Keep the focus in the search box.
                  event.preventDefault();
                  choose(tag);
                }}
                onMouseEnter={() => setHighlight(index)}
              >
                <TagIcon className="size-3.5 text-muted-foreground" />
                {tag}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 py-1.5 text-muted-foreground">
            {pending && isValidLabelId(pending)
              ? intl.formatMessage(messages.noMatch, { tag: pending })
              : intl.formatMessage(messages.typeTag)}
          </p>
        )}
      </div>
    ) : null,
    chips:
      active && chosenTags.length > 0 ? (
        <span
          className="flex shrink-0 items-center gap-1"
          role="group"
          aria-label={intl.formatMessage(messages.chipsLabel)}
        >
          {chosenTags.map((tag) => (
            <span
              key={tag}
              data-slot="tag-pill"
              // The visual workflow editor's pill look, so tokens in fields read alike.
              className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 font-mono text-xs leading-none font-medium text-primary"
            >
              <TagIcon className="size-3 opacity-70" />
              {tag}
              <button
                type="button"
                className="rounded-sm opacity-70 hover:opacity-100"
                aria-label={intl.formatMessage(messages.removeTag, { tag })}
                onClick={() => onQueueAdvancedChange?.(withoutIncludedTag(queueAdvanced, tag))}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </span>
      ) : null,
  };
}
