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
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { Row } from "@/components/ui/layout/row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [frontmatterOpen, setFrontmatterOpen] = useState(true);
  const [savedSnapshot, setSavedSnapshot] = useState<{
    fields: ContentEditorDocumentFrontmatterField[];
    body: string;
    hasFrontmatter: boolean;
    rawFrontmatter: string;
  } | null>(null);
  const editorBaselineSyncedRef = useRef(false);

  function currentDocumentText() {
    return joinContentEditorDocument({ fields, body, hasFrontmatter, rawFrontmatter });
  }

  function snapshotDocumentText(snapshot: NonNullable<typeof savedSnapshot>) {
    return joinContentEditorDocument(snapshot);
  }

  const hasUnsavedChanges =
    savedSnapshot !== null && currentDocumentText() !== snapshotDocumentText(savedSnapshot);

  function handleMarkdownBodyChange(next: string) {
    setBody(next);
    if (!editorBaselineSyncedRef.current) {
      editorBaselineSyncedRef.current = true;
      setSavedSnapshot({
        fields,
        body: next,
        hasFrontmatter,
        rawFrontmatter,
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setIsFetching(true);
    setSavedSnapshot(null);
    editorBaselineSyncedRef.current = false;
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
        editorBaselineSyncedRef.current = isMdxDocumentFilename(filename);
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
  }, [intl, role, seedSrc, src]);

  const emptyLabel =
    role === "source"
      ? intl.formatMessage(contentEditorFileViewMessages.sourceEmpty)
      : intl.formatMessage(contentEditorFileViewMessages.targetEmpty);

  async function handleSave() {
    if (!onSave || readOnly) {
      return;
    }
    setIsSaving(true);
    try {
      const text = currentDocumentText();
      const file = new File([text], filename, { type: "text/markdown" });
      await onSave(file);
      setSavedSnapshot({ fields, body, hasFrontmatter, rawFrontmatter });
      editorBaselineSyncedRef.current = true;
    } finally {
      setIsSaving(false);
    }
  }

  const showSpinner = isLoading || isFetching;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-8 md:px-10 md:py-10">
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
                className="border-b border-border/60 pb-6"
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-start hover:text-foreground">
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <FormattedMessage {...contentEditorFileViewMessages.documentFrontmatter} />
                  </h4>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      frontmatterOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="grid gap-3">
                    {fields.map((field, index) => (
                      <div key={`${field.key}-${index}`} className="grid gap-1.5">
                        <Label
                          htmlFor={`content-editor-document-field-${role}-${field.key}`}
                          className="text-xs text-muted-foreground"
                        >
                          {field.key}
                        </Label>
                        <Input
                          id={`content-editor-document-field-${role}-${field.key}`}
                          value={field.value}
                          disabled={readOnly}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setFields((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, value } : entry,
                              ),
                            );
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {hasFrontmatter ? (
                <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <FormattedMessage {...contentEditorFileViewMessages.documentBody} />
                </h4>
              ) : null}
              {readOnly ? (
                <MarkdownPreview
                  value={body}
                  chrome="minimal"
                  className="min-h-[16rem] flex-1"
                  contentClassName="prose prose-sm max-w-none dark:prose-invert"
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
                  className="min-h-[16rem] resize-y font-mono text-sm leading-relaxed"
                />
              ) : (
                <MarkdownEditor
                  key={`${role}-${src ?? seedSrc ?? "missing"}-${filename}`}
                  value={body}
                  onChange={handleMarkdownBodyChange}
                  disabled={isBusy || isSaving}
                  ariaLabel={intl.formatMessage(contentEditorFileViewMessages.documentEditorAria)}
                  className="min-h-[20rem] flex-1 border-0 bg-transparent shadow-none"
                />
              )}
            </div>
          </>
        )}
      </div>

      {!readOnly && (footerActions || onSave) ? (
        <div className="shrink-0 border-t border-border/60 px-6 py-3 md:px-10">
          <Row spacing="1u" align="end" alignY="center">
            {footerActions}
            {onSave ? (
              <Button
                type="button"
                variant="default"
                size="xs"
                disabled={!hasUnsavedChanges || isBusy || isSaving}
                onClick={() => void handleSave()}
              >
                {isBusy || isSaving ? (
                  <HugeiconsIcon icon={Loading03Icon} className="animate-spin" aria-hidden />
                ) : (
                  <HugeiconsIcon icon={FloppyDiskIcon} data-icon="inline-start" aria-hidden />
                )}
                <FormattedMessage {...contentEditorFileViewMessages.saveEdits} />
              </Button>
            ) : null}
          </Row>
        </div>
      ) : null}
    </div>
  );
}
