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
import { ArrowDown01Icon, FloppyDiskIcon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState, type ReactNode } from "react";
import type { MarkdownSelectionAiConfig } from "@/components/markdown-editor/markdown-selection-ai.types";
import { createPortal } from "react-dom";
import { FormattedMessage, useIntl } from "react-intl";

import {
  joinContentEditorDocument,
  splitContentEditorDocument,
  type ContentEditorDocumentFrontmatterField,
} from "@/components/content-editor/file-view/content-editor-document-frontmatter";
import { contentEditorFileViewMessages } from "@/components/content-editor/file-view/content-editor-file-view.messages";
import { FileViewPaneState } from "@/components/content-editor/file-view/content-editor-file-view-layout";
import { MarkdownEditor, MarkdownPreview } from "@/components/markdown-editor/markdown-editor";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/primitives/cn";

export const CONTENT_EDITOR_DOCUMENT_FILE_UPLOAD_ACCEPT = ".md,.markdown,.mdx";

function isMdxDocumentFilename(filename: string) {
  return filename.toLowerCase().endsWith(".mdx");
}

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

export function ContentEditorDocumentFileViewerPane({
  role,
  src,
  seedSrc,
  filename,
  isLoading,
  canEdit = true,
  isBusy = false,
  onSave,
  footerActions,
  saveActionsContainer,
  onReviewBlockedChange,
  selectionAi,
}: {
  role: "source" | "target";
  src?: string | null;
  seedSrc?: string | null;
  filename: string;
  isLoading?: boolean;
  canEdit?: boolean;
  isBusy?: boolean;
  onSave?: (file: File) => void | Promise<void>;
  footerActions?: ReactNode;
  saveActionsContainer?: HTMLElement | null;
  onReviewBlockedChange?: (blocked: boolean) => void;
  selectionAi?: MarkdownSelectionAiConfig;
}) {
  const intl = useIntl();
  const readOnly = role === "source" || !canEdit;
  const [fields, setFields] = useState<ContentEditorDocumentFrontmatterField[]>([]);
  const [body, setBody] = useState("");
  const [hasFrontmatter, setHasFrontmatter] = useState(false);
  const [rawFrontmatter, setRawFrontmatter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [frontmatterOpen, setFrontmatterOpen] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<{
    fields: ContentEditorDocumentFrontmatterField[];
    body: string;
    hasFrontmatter: boolean;
    rawFrontmatter: string;
  } | null>(null);

  function currentDocumentText() {
    return joinContentEditorDocument({ fields, body, hasFrontmatter, rawFrontmatter });
  }

  function snapshotDocumentText(snapshot: NonNullable<typeof savedSnapshot>) {
    return joinContentEditorDocument(snapshot);
  }

  const hasUnsavedChanges =
    savedSnapshot !== null && currentDocumentText() !== snapshotDocumentText(savedSnapshot);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSaveError(false);
    setCodeMode(false);
    setIsFetching(true);
    setSavedSnapshot(null);
    void (async () => {
      try {
        const primary = await loadDocumentText(src);
        if (cancelled) {
          return;
        }
        if (primary.status === "error") {
          setError(
            role === "source"
              ? intl.formatMessage(contentEditorFileViewMessages.sourceEmpty)
              : intl.formatMessage(contentEditorFileViewMessages.documentLoadFailed),
          );
          return;
        }

        let loaded = primary.status === "ok" ? primary.text : "";
        if (primary.status === "missing" && role === "target") {
          const seed = await loadDocumentText(seedSrc);
          if (cancelled) {
            return;
          }
          if (seed.status === "ok") {
            loaded = seed.text;
          }
        }
        if (!loaded && role === "source") {
          setError(intl.formatMessage(contentEditorFileViewMessages.sourceEmpty));
          return;
        }
        const split = splitContentEditorDocument(loaded);
        setFields(split.fields);
        setBody(split.body);
        setHasFrontmatter(split.hasFrontmatter);
        setRawFrontmatter(split.rawFrontmatter);
        setSavedSnapshot({
          fields: split.fields,
          body: split.body,
          hasFrontmatter: split.hasFrontmatter,
          rawFrontmatter: split.rawFrontmatter,
        });
      } catch {
        if (!cancelled) {
          setError(
            role === "source"
              ? intl.formatMessage(contentEditorFileViewMessages.sourceEmpty)
              : intl.formatMessage(contentEditorFileViewMessages.targetEmpty),
          );
        }
      } finally {
        if (!cancelled) {
          setIsFetching(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intl, role, seedSrc, src, filename]);

  const emptyLabel =
    role === "source"
      ? intl.formatMessage(contentEditorFileViewMessages.sourceEmpty)
      : intl.formatMessage(contentEditorFileViewMessages.targetEmpty);

  async function handleSave() {
    if (!onSave || readOnly) {
      return;
    }
    setIsSaving(true);
    setSaveError(false);
    try {
      const text = currentDocumentText();
      const file = new File([text], filename, { type: "text/markdown" });
      await onSave(file);
      setSavedSnapshot({ fields, body, hasFrontmatter, rawFrontmatter });
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }

  const showSpinner = isLoading || isFetching;
  const reviewBlocked =
    hasUnsavedChanges ||
    Boolean(showSpinner) ||
    Boolean(error) ||
    isSaving ||
    savedSnapshot === null;
  useEffect(() => {
    onReviewBlockedChange?.(reviewBlocked);
  }, [onReviewBlockedChange, reviewBlocked]);
  const saveActions =
    !readOnly && onSave ? (
      <div className="flex flex-wrap items-center gap-2">
        {savedSnapshot && !error && !showSpinner ? (
          <span role="status" className="hidden text-xs text-muted-foreground sm:inline">
            <FormattedMessage
              {...(isSaving
                ? contentEditorFileViewMessages.documentSaving
                : hasUnsavedChanges
                  ? contentEditorFileViewMessages.documentUnsaved
                  : contentEditorFileViewMessages.documentSaved)}
            />
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={
            !hasUnsavedChanges || isBusy || isSaving || Boolean(showSpinner) || Boolean(error)
          }
          onClick={() => void handleSave()}
        >
          {isSaving ? (
            <HugeiconsIcon icon={Loading03Icon} className="animate-spin" aria-hidden />
          ) : (
            <HugeiconsIcon icon={FloppyDiskIcon} data-icon="inline-start" aria-hidden />
          )}
          <FormattedMessage {...contentEditorFileViewMessages.saveEdits} />
        </Button>
      </div>
    ) : null;

  return (
    <div className="flex min-h-full min-w-0 flex-col">
      {saveActionsContainer ? (
        createPortal(saveActions, saveActionsContainer)
      ) : saveActions ? (
        <div className="flex justify-end border-b border-border px-4 py-2">{saveActions}</div>
      ) : null}
      {saveError ? (
        <p role="alert" className="px-6 py-3 text-sm text-destructive">
          <FormattedMessage {...contentEditorFileViewMessages.documentSaveFailed} />
        </p>
      ) : null}
      {footerActions ? (
        <div className="flex flex-wrap justify-end gap-2 px-4 py-2">{footerActions}</div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        {showSpinner ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" aria-hidden />
          </div>
        ) : error ? (
          <FileViewPaneState>{error}</FileViewPaneState>
        ) : !src && role === "source" ? (
          <FileViewPaneState>{emptyLabel}</FileViewPaneState>
        ) : (
          <>
            {hasFrontmatter ? (
              <Collapsible
                open={frontmatterOpen}
                onOpenChange={setFrontmatterOpen}
                className="border-b border-border/60 px-6 py-2"
              >
                <CollapsibleTrigger render={<Button variant="ghost" size="sm" />} className="gap-2">
                  <FormattedMessage {...contentEditorFileViewMessages.documentDetails} />
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground",
                      frontmatterOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <FieldGroup className="gap-4 pb-4">
                    {fields.map((field, index) => (
                      <Field key={`${field.key}-${index}`}>
                        <FieldLabel
                          htmlFor={`content-editor-document-field-${role}-${field.key}`}
                          className="text-xs text-muted-foreground"
                        >
                          {field.key}
                        </FieldLabel>
                        <Input
                          id={`content-editor-document-field-${role}-${field.key}`}
                          value={field.value}
                          disabled={readOnly || isBusy || isSaving}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setFields((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, value } : entry,
                              ),
                            );
                          }}
                        />
                      </Field>
                    ))}
                  </FieldGroup>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {!readOnly && isMdxDocumentFilename(filename) ? (
                <div className="flex justify-end border-b border-border px-4 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={codeMode}
                    onClick={() => setCodeMode((current) => !current)}
                  >
                    <FormattedMessage
                      {...(codeMode
                        ? contentEditorFileViewMessages.previewDocument
                        : contentEditorFileViewMessages.editCode)}
                    />
                  </Button>
                </div>
              ) : null}
              {readOnly || (isMdxDocumentFilename(filename) && !codeMode) ? (
                <MarkdownPreview
                  value={body}
                  chrome="minimal"
                  className="min-h-[40rem] flex-1"
                  contentClassName="px-6 py-10 text-base leading-7 text-foreground sm:px-12 sm:py-14 [&_h1]:text-3xl [&_h2]:mt-8 [&_p]:my-4"
                  emptyMessage={emptyLabel}
                />
              ) : isMdxDocumentFilename(filename) ? (
                /*
                MDX keeps a raw textarea: TipTap getMarkdown() HTML-escapes angle brackets,
                which corrupts JSX and raw HTML on save (e.g. <Callout> → &lt;Callout&gt;).
              */
                <Textarea
                  value={body}
                  onChange={(event) => setBody(event.currentTarget.value)}
                  aria-label={intl.formatMessage(contentEditorFileViewMessages.documentEditorAria)}
                  disabled={isBusy || isSaving}
                  className="min-h-[40rem] resize-none rounded-none border-0 px-6 py-10 font-mono text-sm leading-relaxed shadow-none"
                />
              ) : (
                <MarkdownEditor
                  key={`${role}-${src ?? seedSrc ?? "missing"}-${filename}`}
                  value={body}
                  onInitialContent={(normalizedBody) => {
                    setBody(normalizedBody);
                    setSavedSnapshot({
                      fields,
                      body: normalizedBody,
                      hasFrontmatter,
                      rawFrontmatter,
                    });
                  }}
                  onChange={setBody}
                  disabled={isBusy || isSaving}
                  ariaLabel={intl.formatMessage(contentEditorFileViewMessages.documentEditorAria)}
                  selectionAi={selectionAi}
                  chrome="document"
                  className="flex-1"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
