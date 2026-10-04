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
  CaretDownIcon,
  CodeSimpleIcon,
  SparkleIcon,
  TextTIcon,
  TranslateIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import {
  joinContentEditorDocument,
  splitContentEditorDocument,
  type ContentEditorDocumentFrontmatterField,
} from "@/components/content-editor/file-view/content-editor-document-frontmatter";
import { FileViewPaneState } from "@/components/content-editor/file-view/content-editor-file-view-layout";
import { contentEditorFileViewMessages } from "@/components/content-editor/file-view/content-editor-file-view.messages";
import { ContentEditorAddToGlossary } from "@/components/content-editor/intelligence/content-editor-add-to-glossary";
import { DocumentEditor } from "@/components/document-editor/document-editor";
import {
  DocumentEditorAssistantPanel,
  type DocumentAssistantFocus,
} from "@/components/document-editor/document-editor-assistant-panel";
import type { DocumentAssistantServices } from "@/components/document-editor/document-editor-assistant.types";
import { glossaryEntryFromTargetSelection } from "@/components/document-editor/document-editor-glossary";
import {
  peekDocumentAutosaveDraft,
  useDocumentAutosave,
} from "@/components/document-editor/document-editor-autosave";
import {
  alignDocumentBlocks,
  documentBlocksFromJson,
} from "@/components/document-editor/document-editor-blocks";
import {
  createDocumentMarkdownManager,
  isLossyDocumentRoundTrip,
  isAsciidocFilename,
  isMdxFilename,
  serializeDocumentBlock,
} from "@/components/document-editor/document-editor-extensions";
import { getDocumentSuggestions } from "@/components/document-editor/document-editor-suggestions";
import { DocumentSaveStatus } from "@/components/document-editor/document-editor-save-status";
import {
  documentBlockRange,
  documentBlocksFromNode,
  planDocumentTranslation,
  untranslatedDocumentBlocks,
  type DocumentTranslateScope,
} from "@/components/document-editor/document-editor-translate";
import {
  DocumentSuggestionBar,
  DocumentTranslateDialog,
  useDocumentTranslation,
} from "@/components/document-editor/document-editor-translation";
import { documentEditorMessages as messages } from "@/components/document-editor/document-editor.messages";
import type { MarkdownSelectionAiConfig } from "@/components/markdown-editor/markdown-selection-ai.types";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

export const CONTENT_EDITOR_DOCUMENT_FILE_UPLOAD_ACCEPT = ".md,.markdown,.mdx,.adoc,.asciidoc,.asc";

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

type LoadedTarget = {
  fields: ContentEditorDocumentFrontmatterField[];
  hasFrontmatter: boolean;
  rawFrontmatter: string;
  body: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sourceBody: string; target: LoadedTarget };

const EMPTY_TRANSLATE_COUNTS: Record<DocumentTranslateScope, number> = { untranslated: 0, all: 0 };

export function ContentEditorDocumentEditorPane({
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
  selectionAi,
  assistant,
}: {
  /** Changes when a different document opens; the pane loads once per key. */
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
  selectionAi?: MarkdownSelectionAiConfig;
  assistant?: DocumentAssistantServices;
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const syntax = isMdxFilename(filename) ? "mdx" : "markdown";
  const isAsciidoc = isAsciidocFilename(filename);
  const editable = canEdit && Boolean(onSave);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [fields, setFields] = useState<ContentEditorDocumentFrontmatterField[]>([]);
  const [body, setBody] = useState("");
  const [baseline, setBaseline] = useState<string | null>(null);
  const [parseLossy, setParseLossy] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [restoreSaveError, setRestoreSaveError] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [focusedBlock, setFocusedBlock] = useState<number | null>(null);
  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0);
  const [glossaryEntry, setGlossaryEntry] = useState<{
    sourceTerm: string;
    targetTerm: string;
  } | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [concordanceSeed, setConcordanceSeed] = useState<{ query: string; nonce: number } | null>(
    null,
  );
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateCounts, setTranslateCounts] = useState(EMPTY_TRANSLATE_COUNTS);
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
      setCodeMode(isAsciidocFilename(filename));
      setParseLossy(false);
      setPendingSuggestionCount(0);
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
      const sourceSplit = splitContentEditorDocument(source.text);
      const targetSplit = splitContentEditorDocument(
        target.status === "ok" ? target.text : source.text,
      );
      const serverText = joinContentEditorDocument(targetSplit);
      const draft = peekDocumentAutosaveDraft(documentKey);
      if (draft) {
        const split = splitContentEditorDocument(draft.value);
        setFields(split.fields);
        setBody(split.body);
        setBaseline(serverText);
        setRestoreSaveError(draft.failed);
      } else {
        setFields(targetSplit.fields);
        setBody(targetSplit.body);
      }
      setLoad({ status: "ready", sourceBody: sourceSplit.body, target: targetSplit });
    })();
    return () => {
      cancelled = true;
    };
    // Reload only when another document opens, not when our own save bumps the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentKey, isLoading, sourceSrc]);

  const target = load.status === "ready" ? load.target : null;
  const fullText = target
    ? joinContentEditorDocument({
        fields,
        body,
        hasFrontmatter: target.hasFrontmatter,
        rawFrontmatter: target.rawFrontmatter,
      })
    : "";

  const save = useCallback(
    async (text: string) => {
      await onSave?.(
        new File([text], filename, { type: isAsciidoc ? "text/asciidoc" : "text/markdown" }),
      );
    },
    [filename, isAsciidoc, onSave],
  );
  const autosave = useDocumentAutosave({
    id: documentKey,
    value: fullText,
    baseline,
    save,
    enabled: editable,
    restoreError: restoreSaveError,
    onAbandonedSaveError: () => {
      toast.error(intl.formatMessage(messages.saveAbandoned));
    },
  });
  saveNowRef.current = autosave.saveNow;

  const handleInitialValue = useCallback(
    (normalized: string) => {
      if (!target) return;
      const original = target.body;
      const lossy = isLossyDocumentRoundTrip(syntax, original, normalized);
      setParseLossy(lossy);
      if (lossy) {
        setCodeMode(true);
        setBaseline(
          (current) =>
            current ??
            joinContentEditorDocument({
              fields: target.fields,
              body: original,
              hasFrontmatter: target.hasFrontmatter,
              rawFrontmatter: target.rawFrontmatter,
            }),
        );
        return;
      }
      setBody((current) => (current === original ? normalized : current));
      setBaseline(
        (current) =>
          current ??
          joinContentEditorDocument({
            fields: target.fields,
            body: normalized,
            hasFrontmatter: target.hasFrontmatter,
            rawFrontmatter: target.rawFrontmatter,
          }),
      );
    },
    [syntax, target],
  );

  const sourceManager = useMemo(() => createDocumentMarkdownManager(syntax), [syntax]);
  const sourceDoc = useMemo(
    () => (load.status === "ready" ? sourceManager.parse(load.sourceBody) : null),
    [load, sourceManager],
  );
  const sourceBlocks = useMemo(
    () => (sourceDoc ? documentBlocksFromJson(sourceDoc) : []),
    [sourceDoc],
  );
  const translation = useDocumentTranslation({
    editor,
    sourceDoc,
    sourceManager,
    services: editable ? (assistant ?? null) : null,
  });

  const deferredBody = useDeferredValue(body);
  const flaggedBlocks = useMemo(() => {
    if (!editor || editor.isDestroyed || sourceBlocks.length === 0) return new Set<number>();
    return untranslatedDocumentBlocks(sourceBlocks, editor.state.doc);
    // deferredBody tracks edits; the editor document is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredBody, editor, sourceBlocks]);

  const assistantFocus = useMemo((): DocumentAssistantFocus => {
    if (!assistantOpen || !editor || editor.isDestroyed || !sourceDoc || focusedBlock === null) {
      return { status: "none" };
    }
    const doc = editor.state.doc;
    if (focusedBlock >= doc.childCount) return { status: "none" };
    const sourceIndex = alignDocumentBlocks(sourceBlocks, documentBlocksFromNode(doc))[
      focusedBlock
    ];
    const sourceBlock = sourceIndex === null ? undefined : sourceDoc.content?.[sourceIndex];
    if (sourceIndex === null || !sourceBlock) return { status: "no-source" };
    const node = doc.child(focusedBlock);
    return {
      status: "ok",
      sourceMarkdown: serializeDocumentBlock(sourceManager, sourceBlock),
      sourceText: sourceBlocks[sourceIndex].text,
      targetMarkdown: editor.markdown ? serializeDocumentBlock(editor.markdown, node.toJSON()) : "",
      targetText: node.textBetween(0, node.content.size, "\n", "\n"),
    };
    // deferredBody tracks edits; the editor document is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantOpen, deferredBody, editor, focusedBlock, sourceBlocks, sourceDoc, sourceManager]);

  const replaceFocusedBlock = useCallback(
    (markdown: string) => {
      if (!editor || !editor.markdown || focusedBlock === null) return;
      const range = documentBlockRange(editor.state.doc, focusedBlock);
      const content = editor.markdown.parse(markdown).content ?? [];
      if (!range || content.length === 0) return;
      editor.chain().focus().insertContentAt(range, content).run();
    },
    [editor, focusedBlock],
  );

  const translateBlock = useCallback(
    (blockIndex: number) => {
      if (!editor || !sourceDoc) return;
      const tasks = planDocumentTranslation(sourceDoc, editor.state.doc, "all").filter(
        (task) => task.targetIndex === blockIndex,
      );
      if (tasks.length === 0) {
        toast.info(intl.formatMessage(messages.translateNothing));
        return;
      }
      void translation.start(tasks);
    },
    [editor, intl, sourceDoc, translation],
  );

  const openTranslateDialog = () => {
    if (!editor || !sourceDoc) return;
    setTranslateCounts({
      untranslated: planDocumentTranslation(sourceDoc, editor.state.doc, "untranslated").length,
      all: planDocumentTranslation(sourceDoc, editor.state.doc, "all").length,
    });
    setTranslateOpen(true);
  };

  const openConcordance = () => {
    const selection = editor?.state.selection;
    const query =
      editor && selection && !selection.empty
        ? editor.state.doc.textBetween(selection.from, selection.to, " ")
        : "";
    setAssistantOpen(true);
    setConcordanceSeed((current) => ({ query, nonce: (current?.nonce ?? 0) + 1 }));
  };

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      setPendingSuggestionCount(0);
      return;
    }
    const sync = () => {
      setPendingSuggestionCount(getDocumentSuggestions(editor.state).length);
    };
    sync();
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "s" && !event.shiftKey) {
        event.preventDefault();
        void autosave.saveNow();
      } else if (key === "j" && assistant) {
        event.preventDefault();
        setAssistantOpen((open) => !open);
      } else if (key === "f" && event.shiftKey && assistant) {
        event.preventDefault();
        openConcordance();
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
    autosave.status.kind === "error" ||
    translation.progress !== null ||
    pendingSuggestionCount > 0;
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

  const modShortcut = isMac ? "⌘" : "Ctrl+";
  const canTranslate = Boolean(editable && assistant && sourceDoc && !codeMode);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1">
      {saveActionsContainer && saveStatus ? createPortal(saveStatus, saveActionsContainer) : null}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="sticky top-0 z-20 flex items-center gap-1 border-b border-border/50 bg-background/90 px-4 py-1.5 backdrop-blur">
          {!saveActionsContainer ? saveStatus : null}
          <div className="ms-auto flex items-center gap-1">
            {canTranslate ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={translation.progress !== null}
                onClick={openTranslateDialog}
              >
                <TranslateIcon data-icon="inline-start" />
                {intl.formatMessage(messages.translateDocument)}
              </Button>
            ) : null}
            {assistant ? (
              <Button
                size="xs"
                variant="ghost"
                aria-pressed={assistantOpen}
                className={cn(assistantOpen && "bg-muted")}
                title={intl.formatMessage(messages.shortcutHint, { shortcut: `${modShortcut}J` })}
                onClick={() => setAssistantOpen((open) => !open)}
              >
                <SparkleIcon data-icon="inline-start" className="text-violet-500" />
                {intl.formatMessage(messages.assistant)}
              </Button>
            ) : null}
            {editable && !isAsciidoc ? (
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

        {parseLossy ? (
          <div className="mx-auto mt-4 flex max-w-[46rem] items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
            <WarningIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p className="flex-1">{intl.formatMessage(messages.parseFallback)}</p>
            {!codeMode ? (
              <Button size="xs" variant="outline" onClick={() => setCodeMode(true)}>
                {intl.formatMessage(messages.viewCode)}
              </Button>
            ) : null}
          </div>
        ) : null}
        {pendingSuggestionCount > 0 ? (
          <div className="mx-auto mt-4 flex max-w-[46rem] items-start gap-2 rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-sm">
            <WarningIcon className="mt-0.5 size-4 shrink-0 text-violet-600" />
            <p className="flex-1">{intl.formatMessage(messages.reviewPendingSuggestions)}</p>
          </div>
        ) : null}

        <div
          className={cn(
            "mx-auto grid w-full items-start gap-8 px-2 pt-10 sm:px-6",
            splitView && !codeMode ? "max-w-[100rem] xl:grid-cols-2" : "max-w-[60rem]",
          )}
        >
          {splitView && !codeMode ? (
            <section
              className="min-w-0 rounded-xl bg-muted/30 py-6"
              aria-label={intl.formatMessage(contentEditorFileViewMessages.sourceHeading, {
                locale: sourceLocale,
              })}
            >
              <p className="mb-4 ps-14 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {intl.formatMessage(contentEditorFileViewMessages.sourceHeading, {
                  locale: sourceLocale,
                })}
              </p>
              <DocumentEditor
                key={`source-${documentKey}`}
                value={load.sourceBody}
                syntax={syntax}
                editable={false}
                showOutline={false}
                ariaLabel={intl.formatMessage(contentEditorFileViewMessages.sourceHeading, {
                  locale: sourceLocale,
                })}
                onChange={() => undefined}
              />
            </section>
          ) : null}
          <section
            className="min-w-0"
            aria-label={intl.formatMessage(contentEditorFileViewMessages.targetHeading, {
              locale: targetLocale,
            })}
          >
            {target?.hasFrontmatter && fields.length > 0 ? (
              <Collapsible
                open={propertiesOpen}
                onOpenChange={setPropertiesOpen}
                className="mx-auto mb-6 max-w-[46rem] ps-14 pe-6"
              >
                <CollapsibleTrigger
                  render={
                    <Button variant="ghost" size="xs" className="-ms-2 text-muted-foreground" />
                  }
                >
                  <CaretDownIcon
                    data-icon="inline-start"
                    className={cn("transition-transform", !propertiesOpen && "-rotate-90")}
                  />
                  {intl.formatMessage(contentEditorFileViewMessages.documentDetails)}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <dl className="mt-2 grid grid-cols-[minmax(6rem,10rem)_1fr] gap-x-4 gap-y-1 text-sm">
                    {fields.map((field, index) => (
                      <div key={`${field.key}-${index}`} className="contents">
                        <dt className="truncate py-1.5 font-mono text-xs text-muted-foreground">
                          <label htmlFor={`document-property-${index}`}>{field.key}</label>
                        </dt>
                        <dd>
                          <Input
                            id={`document-property-${index}`}
                            value={field.value}
                            disabled={!editable}
                            className="h-8 border-transparent bg-transparent shadow-none hover:border-border focus-visible:border-border"
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setFields((current) =>
                                current.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, value } : entry,
                                ),
                              );
                            }}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            {codeMode ? (
              <div className="mx-auto max-w-[46rem] px-6 pb-16">
                <Textarea
                  value={body}
                  onChange={(event) => setBody(event.currentTarget.value)}
                  aria-label={intl.formatMessage(messages.codeAria)}
                  spellCheck={false}
                  className="min-h-[40rem] resize-y font-mono text-[13px] leading-relaxed"
                />
              </div>
            ) : null}
            <div hidden={codeMode} inert={codeMode || undefined}>
              <DocumentEditor
                key={`target-${documentKey}`}
                value={body}
                syntax={syntax}
                editable={editable && !codeMode}
                ariaLabel={intl.formatMessage(contentEditorFileViewMessages.documentEditorAria)}
                onChange={setBody}
                onInitialValue={handleInitialValue}
                onEditorChange={setEditor}
                onFocusedBlockChange={setFocusedBlock}
                onTranslateBlock={canTranslate ? translateBlock : undefined}
                onAddToGlossary={
                  editable && assistant?.glossary && editor
                    ? (text) =>
                        setGlossaryEntry(
                          glossaryEntryFromTargetSelection(editor, sourceBlocks, text),
                        )
                    : undefined
                }
                selectionAi={selectionAi}
                flaggedBlocks={flaggedBlocks}
              />
            </div>
          </section>
        </div>
        {editor && !codeMode ? (
          <DocumentSuggestionBar
            editor={editor}
            progress={translation.progress}
            onStop={translation.stop}
          />
        ) : null}
      </div>
      {assistant && assistantOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-label={intl.formatMessage(messages.assistantClose)}
            onClick={() => setAssistantOpen(false)}
          />
          <aside className="fixed inset-y-0 end-0 z-50 flex w-[min(22rem,100%)] flex-col border-s border-border bg-background md:static md:z-auto md:w-[22rem] md:shrink-0">
            <DocumentEditorAssistantPanel
              services={assistant}
              focus={assistantFocus}
              canEdit={editable}
              onReplaceBlock={replaceFocusedBlock}
              onClose={() => setAssistantOpen(false)}
              concordanceSeed={concordanceSeed}
            />
          </aside>
        </>
      ) : null}
      {assistant?.glossary && glossaryEntry ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setGlossaryEntry(null);
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{intl.formatMessage(messages.addToGlossary)}</DialogTitle>
            </DialogHeader>
            <ContentEditorAddToGlossary
              key={`${glossaryEntry.sourceTerm}\n${glossaryEntry.targetTerm}`}
              organizationSlug={assistant.glossary.organizationSlug}
              projectId={assistant.glossary.projectId}
              teamId={assistant.glossary.teamId}
              teamName={assistant.glossary.teamName}
              sourceLocale={sourceLocale}
              targetLocale={targetLocale}
              sourceTerm={glossaryEntry.sourceTerm}
              targetTerm={glossaryEntry.targetTerm}
              teamGlossaries={assistant.glossary.teamGlossaries}
              canContribute={assistant.glossary.canContribute}
              showTitle={false}
              onAdded={() => setGlossaryEntry(null)}
            />
          </DialogContent>
        </Dialog>
      ) : null}
      <DocumentTranslateDialog
        open={translateOpen}
        onOpenChange={setTranslateOpen}
        counts={translateCounts}
        onStart={(scope, instructions) => {
          if (!editor || !sourceDoc) return;
          const tasks = planDocumentTranslation(sourceDoc, editor.state.doc, scope);
          if (tasks.length === 0) {
            toast.info(intl.formatMessage(messages.translateNothing));
            return;
          }
          void translation.start(tasks, instructions || undefined);
        }}
      />
    </div>
  );
}
