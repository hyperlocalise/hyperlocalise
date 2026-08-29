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
  joinCatDocument,
  splitCatDocument,
  type CatDocumentFrontmatterField,
} from "@/components/cat/file-view/cat-document-frontmatter";
import { catFileViewMessages } from "@/components/cat/file-view/cat-file-view.messages";
import { MarkdownEditor, MarkdownPreview } from "@/components/markdown-editor/markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const CAT_DOCUMENT_FILE_UPLOAD_ACCEPT = ".md,.markdown,.mdx";

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

export function CatDocumentFileViewerPane({
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
  const [fields, setFields] = useState<CatDocumentFrontmatterField[]>([]);
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
              ? intl.formatMessage(catFileViewMessages.sourceEmpty)
              : intl.formatMessage(catFileViewMessages.documentLoadFailed),
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
          setError(intl.formatMessage(catFileViewMessages.sourceEmpty));
          return;
        }
        const split = splitCatDocument(loaded);
        setFields(split.fields);
        setBody(split.body);
        setHasFrontmatter(split.hasFrontmatter);
        setRawFrontmatter(split.rawFrontmatter);
      } catch {
        if (!cancelled) {
          setError(
            role === "source"
              ? intl.formatMessage(catFileViewMessages.sourceEmpty)
              : intl.formatMessage(catFileViewMessages.targetEmpty),
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
      ? intl.formatMessage(catFileViewMessages.sourceEmpty)
      : intl.formatMessage(catFileViewMessages.targetEmpty);

  async function handleSave() {
    if (!onSave || readOnly) {
      return;
    }
    setIsSaving(true);
    try {
      const text = joinCatDocument({ fields, body, hasFrontmatter, rawFrontmatter });
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
                <FormattedMessage {...catFileViewMessages.documentFrontmatter} />
              </h4>
              <div className="grid gap-2">
                {fields.map((field, index) => (
                  <div key={`${field.key}-${index}`} className="grid gap-1">
                    <Label htmlFor={`cat-document-field-${role}-${field.key}`} className="text-xs">
                      {field.key}
                    </Label>
                    <Input
                      id={`cat-document-field-${role}-${field.key}`}
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
                <FormattedMessage {...catFileViewMessages.documentBody} />
              </h4>
            ) : null}
            {readOnly ? (
              <MarkdownPreview value={body} className="min-h-[16rem]" emptyMessage={emptyLabel} />
            ) : (
              <MarkdownEditor
                value={body}
                onChange={setBody}
                className="min-h-[16rem]"
                ariaLabel={intl.formatMessage(catFileViewMessages.documentEditorAria)}
              />
            )}
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
                <FormattedMessage {...catFileViewMessages.saveEdits} />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
