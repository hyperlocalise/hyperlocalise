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
import { CodeSimpleIcon, TextTIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { FileViewPaneState } from "@/components/content-editor/file-view/content-editor-file-view-layout";
import { contentEditorFileViewMessages } from "@/components/content-editor/file-view/content-editor-file-view.messages";
import {
  peekDocumentAutosaveDraft,
  useDocumentAutosave,
} from "@/components/document-editor/document-editor-autosave";
import { DocumentSaveStatus } from "@/components/document-editor/document-editor-save-status";
import { documentEditorMessages as messages } from "@/components/document-editor/document-editor.messages";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

export const CONTENT_EDITOR_HTML_FILE_UPLOAD_ACCEPT = ".html,.htm";

type LoadedDocument = { status: "missing" } | { status: "ok"; text: string } | { status: "error" };

async function loadDocumentText(src: string | null | undefined): Promise<LoadedDocument> {
  if (!src) {
    return { status: "missing" };
  }
  try {
    const response = await fetch(src);
    if (!response.ok) {
      return { status: "error" };
    }
    return { status: "ok", text: await response.text() };
  } catch {
    return { status: "error" };
  }
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sourceText: string };

export function ContentEditorHtmlEditorPane({
  documentKey,
  sourceSrc,
  targetSrc,
  filename,
  sourceLocale,
  targetLocale,
  isLoading = false,
  canEdit = true,
  splitView = false,
  onSave,
  saveActionsContainer,
  onReviewBlockedChange,
}: {
  documentKey: string;
  sourceSrc: string | null;
  targetSrc: string | null;
  filename: string;
  sourceLocale: string;
  targetLocale: string;
  isLoading?: boolean;
  canEdit?: boolean;
  splitView?: boolean;
  onSave?: (file: File) => void | Promise<void>;
  saveActionsContainer?: HTMLElement | null;
  onReviewBlockedChange?: (blocked: boolean) => void;
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const editable = canEdit && Boolean(onSave);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [body, setBody] = useState("");
  const [baseline, setBaseline] = useState<string | null>(null);
  const [codeMode, setCodeMode] = useState(false);
  const [restoreSaveError, setRestoreSaveError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const targetSrcRef = useRef(targetSrc);
  const saveNowRef = useRef(async () => {});
  const openedKeyRef = useRef<string | null>(null);
  targetSrcRef.current = targetSrc;

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    void (async () => {
      if (openedKeyRef.current !== null && openedKeyRef.current !== documentKey) {
        await saveNowRef.current();
      }
      if (cancelled) return;
      openedKeyRef.current = documentKey;
      setLoad({ status: "loading" });
      setBaseline(null);
      setRestoreSaveError(false);
      const [source, target] = await Promise.all([
        loadDocumentText(sourceSrc),
        loadDocumentText(targetSrcRef.current),
      ]);
      if (cancelled) return;
      if (source.status !== "ok" || !source.text) {
        setLoad({
          status: "error",
          message: intl.formatMessage(contentEditorFileViewMessages.sourceEmpty),
        });
        return;
      }
      if (target.status === "error") {
        setLoad({
          status: "error",
          message: intl.formatMessage(contentEditorFileViewMessages.documentLoadFailed),
        });
        return;
      }
      const serverText = target.status === "ok" ? target.text : source.text;
      const draft = peekDocumentAutosaveDraft(documentKey);
      if (draft) {
        setBody(draft.value);
        setBaseline(serverText);
        setRestoreSaveError(draft.failed);
      } else {
        setBody(serverText);
        setBaseline(serverText);
      }
      setLoad({ status: "ready", sourceText: source.text });
    })();
    return () => {
      cancelled = true;
    };
    // Reload only when another document opens, not when our own save bumps the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey, isLoading, sourceSrc]);

  const save = useCallback(
    async (text: string) => {
      await onSave?.(new File([text], filename, { type: "text/html" }));
    },
    [filename, onSave],
  );
  const autosave = useDocumentAutosave({
    id: documentKey,
    value: body,
    baseline,
    save,
    enabled: editable,
    restoreError: restoreSaveError,
    onAbandonedSaveError: () => {
      toast.error(intl.formatMessage(messages.saveAbandoned));
    },
  });
  saveNowRef.current = autosave.saveNow;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (mod && event.key.toLowerCase() === "s" && !event.shiftKey) {
        event.preventDefault();
        void autosave.saveNow();
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  });

  const reviewBlocked =
    load.status !== "ready" ||
    baseline === null ||
    autosave.hasUnsavedChanges ||
    autosave.status.kind === "saving" ||
    autosave.status.kind === "error";
  useEffect(() => {
    onReviewBlockedChange?.(reviewBlocked);
  }, [onReviewBlockedChange, reviewBlocked]);

  const saveStatus =
    editable && load.status === "ready" && baseline !== null ? (
      <DocumentSaveStatus status={autosave.status} onRetry={() => void autosave.retry()} />
    ) : null;

  if (isLoading || load.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }
  if (load.status === "error") {
    return <FileViewPaneState>{load.message}</FileViewPaneState>;
  }

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1">
      {saveActionsContainer && saveStatus ? createPortal(saveStatus, saveActionsContainer) : null}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="sticky top-0 z-20 flex items-center gap-1 border-b border-border/50 bg-background/90 px-4 py-1.5 backdrop-blur">
          {!saveActionsContainer ? saveStatus : null}
          <div className="ms-auto flex items-center gap-1">
            {editable ? (
              <Button
                size="xs"
                variant="ghost"
                aria-pressed={codeMode}
                onClick={() => setCodeMode((open) => !open)}
              >
                {codeMode ? (
                  <TextTIcon data-icon="inline-start" />
                ) : (
                  <CodeSimpleIcon data-icon="inline-start" />
                )}
                {intl.formatMessage(codeMode ? messages.viewDocument : messages.viewCode)}
              </Button>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "mx-auto grid w-full items-stretch gap-8 px-2 pt-6 pb-10 sm:px-6",
            splitView && !codeMode ? "max-w-[100rem] xl:grid-cols-2" : "max-w-[60rem]",
          )}
        >
          {splitView && !codeMode ? (
            <HtmlPreviewFrame
              srcDoc={load.sourceText}
              label={intl.formatMessage(contentEditorFileViewMessages.sourceHeading, {
                locale: sourceLocale,
              })}
            />
          ) : null}
          {codeMode ? (
            <Textarea
              value={body}
              disabled={!editable}
              spellCheck={false}
              className="min-h-[32rem] font-mono text-sm"
              aria-label={intl.formatMessage(contentEditorFileViewMessages.targetHeading, {
                locale: targetLocale,
              })}
              onChange={(event) => setBody(event.currentTarget.value)}
            />
          ) : (
            <HtmlPreviewFrame
              srcDoc={body}
              label={intl.formatMessage(contentEditorFileViewMessages.targetHeading, {
                locale: targetLocale,
              })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function HtmlPreviewFrame({ srcDoc, label }: { srcDoc: string; label: string }) {
  return (
    <section className="flex min-h-[32rem] min-w-0 flex-col" aria-label={label}>
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <iframe
        title={label}
        sandbox=""
        srcDoc={srcDoc}
        className="min-h-[32rem] w-full flex-1 rounded-xl border border-border bg-white"
      />
    </section>
  );
}
