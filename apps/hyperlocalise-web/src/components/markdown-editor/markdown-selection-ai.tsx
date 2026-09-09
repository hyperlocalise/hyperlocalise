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
import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { SparklesIcon, TranslateIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { markdownSelectionAiMessages as messages } from "./markdown-selection-ai.messages";
import type {
  MarkdownSelectionAiConfig,
  MarkdownSelectionAiResult,
} from "./markdown-selection-ai.types";

const ACTIONS = [
  {
    key: "rewrite",
    instruction:
      "Rewrite the selected passage for natural phrasing and clarity, preserving its meaning and voice.",
  },
  {
    key: "retranslate",
    instruction:
      "Retranslate only the corresponding selected passage from the original into the target locale. Use the original reference to recover the meaning. If the corresponding original passage is unavailable, explain this limitation rather than inventing a translation.",
  },
  {
    key: "grammar",
    instruction:
      "Fix spelling, grammar, and punctuation in the selected passage without changing its meaning or tone.",
  },
  {
    key: "shorten",
    instruction: "Shorten the selected passage while preserving its meaning and important details.",
  },
  {
    key: "formal",
    instruction: "Make the selected passage more formal, appropriate to the target locale.",
  },
  {
    key: "glossary",
    instruction:
      "Align the selected passage with the supplied project glossary. Do not invent glossary rules; explain if no relevant guidance is available.",
  },
] as const;

const MAX_SELECTION_LENGTH = 12_000;
const MAX_CONTEXT_LENGTH = 16_384;
type SelectionSnapshot = { from: number; to: number; text: string; doc: Editor["state"]["doc"] };

export function MarkdownSelectionAi({
  editor,
  config,
  open,
  onOpenChange,
}: {
  editor: Editor;
  config: MarkdownSelectionAiConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const intl = useIntl();
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<MarkdownSelectionAiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selection = useRef<SelectionSnapshot | null>(null);
  const requestVersion = useRef(0);

  useEffect(
    () => () => {
      requestVersion.current += 1;
    },
    [],
  );

  function changeOpen(next: boolean) {
    requestVersion.current += 1;
    setAction(null);
    setPending(false);
    setResult(null);
    setError(null);
    if (next) {
      const { from, to } = editor.state.selection;
      selection.current = {
        from,
        to,
        doc: editor.state.doc,
        text: editor.state.doc.textBetween(from, to, "\n"),
      };
    }
    onOpenChange(next);
  }

  async function ask(chosenAction: (typeof ACTIONS)[number]) {
    setAction(chosenAction);
    const snapshot = selection.current;
    if (!snapshot || !snapshot.text.trim() || snapshot.text.length > MAX_SELECTION_LENGTH) {
      setError(intl.formatMessage(messages.tooLong));
      return;
    }
    if (!editor.state.doc.eq(snapshot.doc)) {
      setError(intl.formatMessage(messages.stale));
      return;
    }
    const version = ++requestVersion.current;
    setPending(true);
    setResult(null);
    setError(null);
    try {
      const before = snapshot.doc.textBetween(0, snapshot.from, "\n");
      const after = snapshot.doc.textBetween(snapshot.to, snapshot.doc.content.size, "\n");
      const sideLength = Math.floor((MAX_CONTEXT_LENGTH - snapshot.text.length) / 2);
      const response = await config.request({
        selectedText: snapshot.text,
        instruction: chosenAction.instruction,
        documentContext: before.slice(-sideLength) + snapshot.text + after.slice(0, sideLength),
      });
      if (requestVersion.current !== version) return;
      if (!response.suggestion.trim()) throw new Error("empty_suggestion");
      setResult(response);
    } catch {
      if (requestVersion.current === version) setError(intl.formatMessage(messages.failed));
    } finally {
      if (requestVersion.current === version) setPending(false);
    }
  }

  function apply() {
    const snapshot = selection.current;
    if (!snapshot || !result || !editor.isEditable || !editor.state.doc.eq(snapshot.doc)) {
      setError(intl.formatMessage(messages.stale));
      return;
    }
    // Insert text nodes, never parse model output as HTML or executable markup.
    const lines = result.suggestion.split("\n");
    const content = lines.flatMap((line, index) => [
      ...(index ? [{ type: "hardBreak" }] : []),
      ...(line ? [{ type: "text", text: line }] : []),
    ]);
    editor.chain().focus().insertContentAt({ from: snapshot.from, to: snapshot.to }, content).run();
    changeOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" onMouseDown={(event) => event.preventDefault()} />
        }
      >
        <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" aria-hidden />
        {intl.formatMessage(messages.ask)}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "max-h-[min(36rem,var(--available-height))] max-w-[calc(100vw-2rem)] overflow-y-auto",
          action ? "w-80 gap-3" : "w-52 gap-0 p-1",
        )}
        data-markdown-bubble-menu=""
      >
        {!action ? (
          <>
            <PopoverTitle className="sr-only">{intl.formatMessage(messages.ask)}</PopoverTitle>
            {ACTIONS.map((item) => (
              <Button
                key={item.key}
                variant="ghost"
                size="sm"
                className="h-9 w-full justify-start gap-2"
                onClick={() => void ask(item)}
              >
                <HugeiconsIcon
                  icon={item.key === "retranslate" ? TranslateIcon : SparklesIcon}
                  data-icon="inline-start"
                  aria-hidden
                />
                {intl.formatMessage(messages[item.key])}
              </Button>
            ))}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <PopoverTitle>{intl.formatMessage(messages[action.key])}</PopoverTitle>
              <span className="text-xs text-muted-foreground">
                {intl.formatMessage(messages.languages, {
                  source: config.sourceLocale,
                  target: config.targetLocale,
                })}
              </span>
            </div>
            {pending ? (
              <div role="status" className="flex items-center gap-2 py-4 text-muted-foreground">
                <Spinner />
                {intl.formatMessage(messages.working)}
              </div>
            ) : result ? (
              <div className="flex flex-col gap-3">
                <p className="whitespace-pre-wrap text-sm leading-6" dir="auto">
                  {result.suggestion}
                </p>
                {result.reasoning ? (
                  <p className="text-xs leading-5 text-muted-foreground" dir="auto">
                    {result.reasoning}
                  </p>
                ) : null}
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => changeOpen(false)}>
                {intl.formatMessage(messages.dismiss)}
              </Button>
              {error && !result ? (
                <Button variant="outline" size="sm" onClick={() => void ask(action)}>
                  {intl.formatMessage(messages.retry)}
                </Button>
              ) : null}
              {result ? (
                <Button size="sm" onClick={apply} disabled={Boolean(error)}>
                  {intl.formatMessage(messages.apply)}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
