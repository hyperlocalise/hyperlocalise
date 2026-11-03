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
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { FileViewPaneState } from "@/components/content-editor/file-view/content-editor-file-view-layout";
import { contentEditorFileViewMessages } from "@/components/content-editor/file-view/content-editor-file-view.messages";
import { hubspotEmailPreviewSrcDoc } from "@/components/content-editor/file-view/content-editor-hubspot-email-preview";
import {
  isFullHtmlDocument,
  serializeDesignModeDocument,
} from "@/components/content-editor/file-view/content-editor-html-design-mode";
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

export type HtmlPreviewFrameHandle = {
  flush: () => string | null;
};

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
  const targetPreviewRef = useRef<HtmlPreviewFrameHandle>(null);
  const targetSrcRef = useRef(targetSrc);
  const saveNowRef = useRef(async () => {});
  const openedKeyRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const bodyRef = useRef(body);
  const baselineRef = useRef(baseline);
  const sentSnapshotsRef = useRef(new Set<string>());
  targetSrcRef.current = targetSrc;
  bodyRef.current = body;
  baselineRef.current = baseline;

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    void (async () => {
      if (openedKeyRef.current !== null && openedKeyRef.current !== documentKey) {
        await saveNowRef.current();
      }
      if (cancelled) return;
      openedKeyRef.current = documentKey;
      readyRef.current = false;
      sentSnapshotsRef.current.clear();
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
      readyRef.current = true;
      setLoad({ status: "ready", sourceText: source.text });
    })();
    return () => {
      cancelled = true;
    };
    // Own-save URL bumps are handled below so generate/upload still reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey, isLoading, sourceSrc]);

  useEffect(() => {
    if (isLoading || !readyRef.current) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const target = await loadDocumentText(targetSrc);
      if (cancelled || target.status !== "ok") {
        return;
      }
      if (
        target.text === bodyRef.current ||
        target.text === baselineRef.current ||
        sentSnapshotsRef.current.has(target.text)
      ) {
        sentSnapshotsRef.current.delete(target.text);
        setBaseline(target.text);
        return;
      }
      setBody(target.text);
      setBaseline(target.text);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetSrc, isLoading]);

  const save = useCallback(
    async (text: string) => {
      sentSnapshotsRef.current.add(text);
      try {
        await onSave?.(new File([text], filename, { type: "text/html" }));
      } catch (error) {
        sentSnapshotsRef.current.delete(text);
        throw error;
      }
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

  const toggleCodeMode = useCallback(() => {
    if (!codeMode) {
      const flushed = targetPreviewRef.current?.flush();
      if (flushed != null) {
        setBody(flushed);
      }
    }
    setCodeMode((open) => !open);
  }, [codeMode]);

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
              <Button size="xs" variant="ghost" aria-pressed={codeMode} onClick={toggleCodeMode}>
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
              toPreviewSrcDoc={hubspotEmailPreviewSrcDoc}
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
              ref={targetPreviewRef}
              srcDoc={body}
              toPreviewSrcDoc={hubspotEmailPreviewSrcDoc}
              editable={editable}
              loadedAsFullDocument={isFullHtmlDocument(body)}
              onHtmlChange={setBody}
              onSaveShortcut={() => void autosave.saveNow()}
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

const HtmlPreviewFrame = forwardRef<
  HtmlPreviewFrameHandle,
  {
    srcDoc: string;
    label: string;
    editable?: boolean;
    loadedAsFullDocument?: boolean;
    onHtmlChange?: (html: string) => void;
    onSaveShortcut?: () => void;
    /** Maps stored file bytes to display bytes (e.g. a preview-only canvas).
     * The stored value stays the source of truth; the frame compares display
     * strings so its own serialized output never triggers a reload. */
    toPreviewSrcDoc?: (html: string) => string;
  }
>(function HtmlPreviewFrame(
  {
    srcDoc,
    label,
    editable = false,
    loadedAsFullDocument = false,
    onHtmlChange,
    onSaveShortcut,
    toPreviewSrcDoc,
  },
  ref,
) {
  const displaySrcDoc = toPreviewSrcDoc?.(srcDoc) ?? srcDoc;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastEmittedRef = useRef(displaySrcDoc);
  const paintSrcDocRef = useRef(displaySrcDoc);
  const loadedAsFullDocumentRef = useRef(loadedAsFullDocument);
  const onHtmlChangeRef = useRef(onHtmlChange);
  const onSaveShortcutRef = useRef(onSaveShortcut);
  const skipSerializeOnLoadRef = useRef(true);
  const teardownRef = useRef<(() => void) | null>(null);

  loadedAsFullDocumentRef.current = loadedAsFullDocument;
  onHtmlChangeRef.current = onHtmlChange;
  onSaveShortcutRef.current = onSaveShortcut;

  const readSerializedHtml = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) {
      return null;
    }
    return serializeDesignModeDocument(doc, loadedAsFullDocumentRef.current);
  }, []);

  const emitChange = useCallback(() => {
    const html = readSerializedHtml();
    if (html == null) {
      return;
    }
    lastEmittedRef.current = toPreviewSrcDoc?.(html) ?? html;
    onHtmlChangeRef.current?.(html);
  }, [readSerializedHtml, toPreviewSrcDoc]);

  useImperativeHandle(
    ref,
    () => ({
      flush: () => {
        const html = readSerializedHtml();
        if (html != null) {
          lastEmittedRef.current = toPreviewSrcDoc?.(html) ?? html;
        }
        return html;
      },
    }),
    [readSerializedHtml, toPreviewSrcDoc],
  );

  useEffect(() => {
    if (displaySrcDoc === lastEmittedRef.current) {
      return;
    }
    lastEmittedRef.current = displaySrcDoc;
    skipSerializeOnLoadRef.current = true;
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.srcdoc = displaySrcDoc;
    }
  }, [displaySrcDoc]);

  const handleLoad = useCallback(() => {
    teardownRef.current?.();
    teardownRef.current = null;

    const doc = iframeRef.current?.contentDocument;
    if (!doc) {
      return;
    }

    if (editable) {
      doc.designMode = "on";

      const onInput = () => {
        emitChange();
      };
      const onKeyDown = (event: KeyboardEvent) => {
        const mod = event.metaKey || event.ctrlKey;
        if (mod && event.key.toLowerCase() === "s" && !event.shiftKey) {
          event.preventDefault();
          emitChange();
          onSaveShortcutRef.current?.();
        }
      };

      doc.addEventListener("input", onInput);
      doc.addEventListener("keydown", onKeyDown);
      teardownRef.current = () => {
        doc.removeEventListener("input", onInput);
        doc.removeEventListener("keydown", onKeyDown);
        doc.designMode = "off";
      };
    }

    if (skipSerializeOnLoadRef.current) {
      skipSerializeOnLoadRef.current = false;
      return;
    }
    emitChange();
  }, [editable, emitChange]);

  useEffect(() => {
    return () => {
      teardownRef.current?.();
    };
  }, []);

  return (
    <section className="flex min-h-[32rem] min-w-0 flex-col" aria-label={label}>
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <iframe
        ref={iframeRef}
        title={label}
        sandbox={editable ? "allow-same-origin" : ""}
        // Keep srcDoc stable while typing. Updating it remounts the document and drops the caret.
        srcDoc={editable ? paintSrcDocRef.current : displaySrcDoc}
        onLoad={handleLoad}
        className={cn(
          "min-h-[32rem] w-full flex-1 rounded-xl border border-border bg-white",
          editable && "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      />
    </section>
  );
});
