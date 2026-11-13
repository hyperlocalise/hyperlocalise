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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import {
  guidelineDocumentsQueryKey,
  useGuidelineDocumentUpload,
} from "./guideline-documents-section";
import { guidelineTextDocumentDialogMessages as messages } from "./guideline-text-document-dialog.messages";
import {
  GUIDELINE_TEMPLATE_CONTENT,
  GUIDELINE_TEMPLATE_TITLE,
} from "./guideline-text-document-template";
import { KnowledgeUploadSection } from "./knowledge-upload-section";

const TITLE_MAX_LENGTH = 200;
const CONTENT_MAX_LENGTH = 50_000;

function markdownFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${(slug || "guideline").slice(0, 100)}.md`;
}

function markdownFile(title: string, content: string): File {
  const filename = markdownFilename(title);
  return new File([content], filename, { type: "text/markdown" });
}

function documentLocales(document: GuidelineDocument): string[] {
  return document.locales ?? (document.locale ? [document.locale] : []);
}

/**
 * Creates a guideline from typed content or edits title and body.
 * Locales and project scope are chosen on the org upload page (create) or on
 * the document detail page (assignments); this dialog only handles the .md body.
 */
export function GuidelineTextDocumentDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  document,
  initialLocales,
  initialIsGlobal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId?: string;
  document?: GuidelineDocument | null;
  /** Create flow: from the upload page locale picker. */
  initialLocales?: string[];
  /** Create flow: from the upload page project scope (all projects). */
  initialIsGlobal?: boolean;
  onSaved?: (documentId?: string) => void;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client, loading } = useGoSvcClient();
  const editing = document != null;
  const [title, setTitle] = useState(document?.title ?? "");
  const [content, setContent] = useState("");
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  const contentSyncedForRef = useRef<string | null>(null);

  const documentIsText = document?.contentType?.startsWith("text/") ?? false;
  const contentQuery = useQuery({
    queryKey: ["guideline-document-content", organizationSlug, projectId, document?.id],
    enabled: open && editing && documentIsText && !loading,
    queryFn: ({ signal }) =>
      client.guidelines.getDocument(organizationSlug, document!.id, projectId, { signal }),
  });
  const loadedContent = contentQuery.data?.content ?? "";
  const contentEditable = replacementFile == null && (!editing || documentIsText);
  const selectedFile =
    replacementFile ?? (document ? { name: document.filename, size: document.byteSize } : null);

  useEffect(() => {
    if (open) {
      setTitle(document?.title ?? "");
      setContent("");
      setEditorEpoch(0);
      setReplacementFile(null);
      setTitleError(null);
      setContentError(null);
      contentSyncedForRef.current = null;
    }
  }, [open, document?.id, document?.title, editing]);

  useEffect(() => {
    if (open && editing && contentQuery.data && contentSyncedForRef.current !== document?.id) {
      setContent(contentQuery.data.content ?? "");
      contentSyncedForRef.current = document?.id ?? null;
    }
  }, [open, editing, contentQuery.data, document?.id]);

  const uploadDocument = useGuidelineDocumentUpload(organizationSlug, projectId);

  const saveEdit = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim();
      const locales = documentLocales(document!);
      const isGlobal = document!.isGlobal ?? false;
      const titleChanged = trimmedTitle !== document!.title;
      const contentChanged =
        !replacementFile &&
        contentEditable &&
        contentQuery.data != null &&
        content !== loadedContent;
      if (replacementFile) {
        await client.guidelines.replaceDocument(
          organizationSlug,
          document!.id,
          {
            file: replacementFile,
            filename: replacementFile.name,
            title: trimmedTitle,
            locales,
            isGlobal,
          },
          projectId,
        );
      } else if (contentChanged) {
        const file = markdownFile(trimmedTitle, content);
        await client.guidelines.replaceDocument(
          organizationSlug,
          document!.id,
          { file, filename: file.name, title: trimmedTitle, locales, isGlobal },
          projectId,
        );
      } else if (titleChanged) {
        await client.guidelines.updateDocument(
          organizationSlug,
          document!.id,
          { title: trimmedTitle, locales, isGlobal },
          projectId,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: guidelineDocumentsQueryKey(organizationSlug, projectId),
      });
      if (document?.id) {
        void queryClient.invalidateQueries({
          queryKey: ["guideline-document", organizationSlug, projectId, document.id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["guideline-document-content", organizationSlug, projectId, document.id],
        });
      }
      onOpenChange(false);
      onSaved?.(document?.id);
    },
    onError: (error) => {
      toast.error(intl.formatMessage(messages.saveFailed), { description: error.message });
    },
  });

  const validate = (): boolean => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError(intl.formatMessage(messages.titleRequired));
    } else if (trimmedTitle.length > TITLE_MAX_LENGTH) {
      setTitleError(intl.formatMessage(messages.titleTooLong));
    } else {
      setTitleError(null);
    }
    if (replacementFile || !contentEditable) {
      setContentError(null);
    } else if (!content.trim()) {
      setContentError(intl.formatMessage(messages.contentRequired));
    } else if (content.length > CONTENT_MAX_LENGTH) {
      setContentError(intl.formatMessage(messages.contentTooLong));
    } else {
      setContentError(null);
    }
    const titleOk = !!trimmedTitle && trimmedTitle.length <= TITLE_MAX_LENGTH;
    const contentOk =
      replacementFile != null ||
      !contentEditable ||
      (!!content.trim() && content.length <= CONTENT_MAX_LENGTH);
    return titleOk && contentOk;
  };

  const handleSave = () => {
    if (!validate()) return;
    if (!editing) {
      const file = markdownFile(title.trim(), content);
      uploadDocument.mutate(
        {
          file,
          title: title.trim(),
          locales: initialLocales ?? [],
          isGlobal: initialIsGlobal ?? false,
        },
        {
          onSuccess: (document) => {
            onOpenChange(false);
            onSaved?.(document.id);
          },
        },
      );
      return;
    }
    saveEdit.mutate();
  };

  const pending = uploadDocument.isPending || saveEdit.isPending;
  const loadingContent = editing && contentEditable && contentQuery.isPending;

  const applyTemplate = () => {
    setContent(GUIDELINE_TEMPLATE_CONTENT);
    setEditorEpoch((epoch) => epoch + 1);
    setContentError(null);
    if (!title.trim()) {
      setTitle(GUIDELINE_TEMPLATE_TITLE);
      setTitleError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,48rem)] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            <FormattedMessage {...(editing ? messages.editTitle : messages.createTitle)} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              {...(editing ? messages.editDescription : messages.createDescription)}
            />
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="guideline-text-title">
              <FormattedMessage {...messages.titleLabel} />
            </FieldLabel>
            <Input
              id="guideline-text-title"
              value={title}
              maxLength={TITLE_MAX_LENGTH + 1}
              onChange={(event) => setTitle(event.target.value)}
              disabled={pending || loadingContent}
            />
            {titleError ? <FieldError>{titleError}</FieldError> : null}
          </Field>
          {editing && selectedFile ? (
            <KnowledgeUploadSection
              showTitle={false}
              allowRemove={false}
              className="space-y-3"
              selectedFile={selectedFile}
              onFilesSelected={(files) => setReplacementFile(files[0] ?? null)}
            />
          ) : null}
          {contentEditable ? (
            <Field className="min-h-0 gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="guideline-text-content">
                  <FormattedMessage {...messages.contentLabel} />
                </FieldLabel>
                {!editing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={applyTemplate}
                    disabled={pending}
                  >
                    <FormattedMessage {...messages.useTemplate} />
                  </Button>
                ) : null}
              </div>
              {loadingContent ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <MarkdownEditor
                  key={editorEpoch}
                  id="guideline-text-content"
                  value={content}
                  onChange={setContent}
                  onInitialContent={setContent}
                  disabled={pending}
                  placeholder={intl.formatMessage(messages.contentPlaceholder)}
                  ariaLabel={intl.formatMessage(messages.contentLabel)}
                  chrome="default"
                  imageUpload={{ organizationSlug, projectId }}
                  className="min-h-48"
                />
              )}
              {contentQuery.isError ? (
                <FieldError>
                  <FormattedMessage {...messages.loadFailed} />
                </FieldError>
              ) : null}
              {contentError ? <FieldError>{contentError}</FieldError> : null}
            </Field>
          ) : null}
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending || loadingContent || (contentEditable && contentQuery.isError)}
          >
            <FormattedMessage {...messages.save} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
