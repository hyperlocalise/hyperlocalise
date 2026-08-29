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
import { FloppyDiskIcon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  joinContentEditorDocument,
  splitContentEditorDocument,
  type ContentEditorDocumentFrontmatterField,
} from "@/components/content-editor/file-view/content-editor-document-frontmatter";
import { contentEditorFileViewMessages } from "@/components/content-editor/file-view/content-editor-file-view.messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/primitives/cn";

export const CONTENT_EDITOR_DOCUMENT_FILE_UPLOAD_ACCEPT = ".md,.markdown,.mdx";

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
}: {
  role: "source" | "target";
  src?: string | null;
  seedSrc?: string | null;
  filename: string;
  isLoading?: boolean;
  canEdit?: boolean;
  isBusy?: boolean;
  onSave?: (file: File) => void | Promise<void>;
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

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setIsFetching(true);
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
      const text = joinContentEditorDocument({ fields, body, hasFrontmatter, rawFrontmatter });
      const file = new File([text], filename, { type: "text/markdown" });
      await onSave(file);
    } finally {
      setIsSaving(false);
    }
  }

  const showSpinner = isLoading || isFetching;

  return (
    <div className="flex min-h-56 flex-col gap-3 rounded-lg border border-border bg-background p-3">
      {showSpinner ? (
        <div className="flex min-h-56 items-center justify-center text-muted-foreground">
          <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin" aria-hidden />
        </div>
      ) : error ? (
        <div className="flex min-h-56 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : !src && role === "source" ? (
        <div className="flex min-h-56 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <>
          {hasFrontmatter ? (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">
                <FormattedMessage {...contentEditorFileViewMessages.documentFrontmatter} />
              </h4>
              <div className="grid gap-2">
                {fields.map((field, index) => (
                  <div key={`${field.key}-${index}`} className="grid gap-1">
                    <Label
                      htmlFor={`content-editor-document-field-${role}-${field.key}`}
                      className="text-xs"
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
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {hasFrontmatter ? (
              <h4 className="text-xs font-medium text-muted-foreground">
                <FormattedMessage {...contentEditorFileViewMessages.documentBody} />
              </h4>
            ) : null}
            {/*
              Use a raw textarea — not TipTap MarkdownEditor. TipTap's getMarkdown()
              HTML-escapes angle brackets, which permanently corrupts MDX/JSX and raw
              HTML on Save (e.g. <Callout> → &lt;Callout&gt;).
            */}
            <Textarea
              value={body}
              readOnly={readOnly}
              disabled={readOnly}
              onChange={(event) => setBody(event.currentTarget.value)}
              aria-label={intl.formatMessage(contentEditorFileViewMessages.documentEditorAria)}
              placeholder={readOnly ? emptyLabel : undefined}
              className={cn(
                "min-h-[16rem] resize-y font-mono text-sm leading-relaxed",
                readOnly && "opacity-90",
              )}
            />
          </div>

          {onSave && !readOnly ? (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isBusy || isSaving}
                onClick={() => void handleSave()}
              >
                {isBusy || isSaving ? (
                  <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" aria-hidden />
                ) : (
                  <HugeiconsIcon icon={FloppyDiskIcon} className="size-3" aria-hidden />
                )}
                <FormattedMessage {...contentEditorFileViewMessages.saveEdits} />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
