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
import { CaretDownIcon, CaretUpIcon, SparkleIcon } from "@phosphor-icons/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { cn } from "@/lib/primitives/cn";

import type { DocumentAssistantServices } from "./document-editor-assistant.types";
import { documentBlocksFromJson } from "./document-editor-blocks";
import { serializeDocumentBlock } from "./document-editor-extensions";
import {
  acceptDocumentSuggestions,
  addDocumentSuggestions,
  getDocumentSuggestions,
  rejectDocumentSuggestions,
} from "./document-editor-suggestions";
import {
  buildDocumentBlockSuggestion,
  locateTargetBlock,
  type DocumentTranslateScope,
  type DocumentTranslationTask,
} from "./document-editor-translate";
import { documentEditorMessages as messages } from "./document-editor.messages";

const TRANSLATE_CONCURRENCY = 4;

export type DocumentTranslationProgress = { done: number; total: number };

type MarkdownSerializer = { serialize: (doc: JSONContent) => string };

/** Drafts blocks in parallel and lands each result as a pending suggestion. */
export function useDocumentTranslation({
  editor,
  sourceDoc,
  sourceManager,
  services,
}: {
  editor: Editor | null;
  sourceDoc: JSONContent | null;
  sourceManager: MarkdownSerializer | null;
  services: DocumentAssistantServices | null;
}) {
  const intl = useIntl();
  const [progress, setProgress] = useState<DocumentTranslationProgress | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = useCallback(
    async (tasks: DocumentTranslationTask[], instructions?: string) => {
      if (!editor || !sourceDoc || !sourceManager || !services || tasks.length === 0) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const sourceBlocks = documentBlocksFromJson(sourceDoc);
      const sourceContent = sourceDoc.content ?? [];
      let done = 0;
      let failed = 0;
      setProgress({ done, total: tasks.length });

      await mapWithConcurrency(tasks, TRANSLATE_CONCURRENCY, async (task) => {
        if (controller.signal.aborted || editor.isDestroyed) return;
        try {
          const markdown = editor.markdown;
          const sourceBlock = sourceContent[task.sourceIndex];
          if (!markdown || !sourceBlock) return;
          const targetIndex = locateTargetBlock(sourceBlocks, editor.state.doc, task.sourceIndex);
          const result = await services.translateBlock({
            sourceMarkdown: serializeDocumentBlock(sourceManager, sourceBlock),
            targetMarkdown:
              targetIndex === null
                ? ""
                : serializeDocumentBlock(markdown, editor.state.doc.child(targetIndex).toJSON()),
            instructions,
          });
          if (controller.signal.aborted || editor.isDestroyed) return;
          const suggestion = buildDocumentBlockSuggestion({
            id: crypto.randomUUID(),
            doc: editor.state.doc,
            sourceBlocks,
            sourceIndex: task.sourceIndex,
            replacement: markdown.parse(result.suggestion).content ?? [],
          });
          if (suggestion) addDocumentSuggestions(editor, [suggestion]);
        } catch {
          failed += 1;
        } finally {
          done += 1;
          if (!controller.signal.aborted) setProgress({ done, total: tasks.length });
        }
      });

      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setProgress(null);
      }
      if (failed > 0 && !controller.signal.aborted) {
        toast.error(intl.formatMessage(messages.translateFailed, { count: failed }));
      }
    },
    [editor, intl, services, sourceDoc, sourceManager],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setProgress(null);
  }, []);

  return { progress, start, stop };
}

export function DocumentTranslateDialog({
  open,
  onOpenChange,
  counts,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: Record<DocumentTranslateScope, number>;
  onStart: (scope: DocumentTranslateScope, instructions: string) => void;
}) {
  const intl = useIntl();
  const [scope, setScope] = useState<DocumentTranslateScope>("untranslated");
  const [instructions, setInstructions] = useState("");
  const effectiveScope = counts.untranslated === 0 ? "all" : scope;
  const count = counts[effectiveScope];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage(messages.translateDocument)}</DialogTitle>
          <DialogDescription>
            {intl.formatMessage(messages.translateDialogDescription)}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          {(["untranslated", "all"] as const).map((option) => (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors",
                effectiveScope === option && "border-primary/50 bg-primary/5",
                option === "untranslated" &&
                  counts.untranslated === 0 &&
                  "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name="document-translate-scope"
                value={option}
                checked={effectiveScope === option}
                disabled={option === "untranslated" && counts.untranslated === 0}
                onChange={() => setScope(option)}
                className="accent-primary"
              />
              {intl.formatMessage(
                option === "untranslated"
                  ? messages.translateScopeUntranslated
                  : messages.translateScopeAll,
                { count: counts[option] },
              )}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">
            {intl.formatMessage(messages.translateInstructions)}
          </span>
          <Textarea
            value={instructions}
            onChange={(event) => setInstructions(event.currentTarget.value)}
            className="min-h-20"
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button
            disabled={count === 0}
            onClick={() => {
              onStart(effectiveScope, instructions.trim());
              onOpenChange(false);
            }}
          >
            <SparkleIcon data-icon="inline-start" />
            {intl.formatMessage(messages.translateStart)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function scrollToSuggestion(editor: Editor, id: string) {
  const card = editor.view.dom.querySelector(`[data-suggestion-id="${CSS.escape(id)}"]`);
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** Floating bar while suggestions or a translation run are pending. */
export function DocumentSuggestionBar({
  editor,
  progress,
  onStop,
}: {
  editor: Editor;
  progress: DocumentTranslationProgress | null;
  onStop: () => void;
}) {
  const intl = useIntl();
  const suggestions = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      getDocumentSuggestions(current.state).map((suggestion) => ({
        id: suggestion.id,
        pending: suggestion.status === "pending",
      })),
    equalityFn: (a, b) =>
      a === b ||
      (!!a &&
        !!b &&
        a.length === b.length &&
        a.every((entry, index) => entry.id === b[index].id && entry.pending === b[index].pending)),
  });
  const [cursor, setCursor] = useState(0);
  if (suggestions.length === 0 && !progress) return null;

  const step = (delta: number) => {
    if (suggestions.length === 0) return;
    const next = (cursor + delta + suggestions.length) % suggestions.length;
    setCursor(next);
    scrollToSuggestion(editor, suggestions[next].id);
  };

  return (
    <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-popover/95 py-1 ps-3 pe-1 text-sm shadow-lg backdrop-blur"
      >
        {progress ? (
          <>
            <Spinner className="size-3.5 text-violet-500" />
            <span className="ms-1.5 tabular-nums">
              {intl.formatMessage(messages.translateProgress, progress)}
            </span>
            <Button size="xs" variant="ghost" className="rounded-full" onClick={onStop}>
              {intl.formatMessage(messages.translateStop)}
            </Button>
            {suggestions.length > 0 ? (
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            ) : null}
          </>
        ) : null}
        {suggestions.length > 0 ? (
          <>
            <SparkleIcon className="size-3.5 text-violet-500" weight="fill" />
            <span className="ms-1 me-1 tabular-nums">
              {intl.formatMessage(messages.suggestionCount, { count: suggestions.length })}
            </span>
            <Button
              size="icon-xs"
              variant="ghost"
              className="rounded-full"
              aria-label={intl.formatMessage(messages.previousSuggestion)}
              onClick={() => step(-1)}
            >
              <CaretUpIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              className="rounded-full"
              aria-label={intl.formatMessage(messages.nextSuggestion)}
              onClick={() => step(1)}
            >
              <CaretDownIcon />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="rounded-full"
              onClick={() =>
                rejectDocumentSuggestions(
                  editor,
                  suggestions.map((suggestion) => suggestion.id),
                )
              }
            >
              {intl.formatMessage(messages.rejectAll)}
            </Button>
            <Button
              size="xs"
              className="rounded-full"
              disabled={!suggestions.some((suggestion) => suggestion.pending)}
              onClick={() =>
                acceptDocumentSuggestions(
                  editor,
                  suggestions.map((suggestion) => suggestion.id),
                )
              }
            >
              {intl.formatMessage(messages.acceptAll)}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
