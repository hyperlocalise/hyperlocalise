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
import { Textarea } from "@/components/ui/textarea";
import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import {
  guidelineDocumentsQueryKey,
  useGuidelineDocumentUpload,
} from "./guideline-documents-section";
import { guidelineTextDocumentDialogMessages as messages } from "./guideline-text-document-dialog.messages";

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

/**
 * Creates a guideline document from typed markdown, or edits the title and
 * markdown content of a text-based document. Content edits replace the file
 * as a new revision; binary uploads (PDF, DOCX) are title-only here and keep
 * file replacement to the upload flow.
 */
export function GuidelineTextDocumentDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  document,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId?: string;
  document?: GuidelineDocument | null;
  onSaved?: () => void;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client, loading } = useGoSvcClient();
  const editing = document != null;
  const [title, setTitle] = useState(document?.title ?? "");
  const [content, setContent] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  const contentSyncedForRef = useRef<string | null>(null);

  const contentQuery = useQuery({
    queryKey: ["guideline-document-content", organizationSlug, projectId, document?.id],
    enabled: open && editing && !loading,
    queryFn: ({ signal }) =>
      client.guidelines.getDocument(organizationSlug, document!.id, projectId, { signal }),
  });
  const loadedContent = contentQuery.data?.content ?? "";
  const contentEditable = !editing || document.contentType.startsWith("text/");

  useEffect(() => {
    if (open) {
      setTitle(document?.title ?? "");
      setContent("");
      setTitleError(null);
      setContentError(null);
      contentSyncedForRef.current = null;
    }
  }, [open, document?.id, document?.title]);

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
      const titleChanged = trimmedTitle !== document!.title;
      const contentChanged =
        contentEditable && contentQuery.data != null && content !== loadedContent;
      if (contentChanged) {
        const file = markdownFile(trimmedTitle, content);
        await client.guidelines.replaceDocument(
          organizationSlug,
          document!.id,
          { file, filename: file.name, title: trimmedTitle },
          projectId,
        );
      } else if (titleChanged) {
        await client.guidelines.updateDocument(
          organizationSlug,
          document!.id,
          { title: trimmedTitle },
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
      onSaved?.();
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
    if (!contentEditable) {
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
      !contentEditable || (!!content.trim() && content.length <= CONTENT_MAX_LENGTH);
    return titleOk && contentOk;
  };

  const handleSave = () => {
    if (!validate()) return;
    if (!editing) {
      const file = markdownFile(title.trim(), content);
      uploadDocument.mutate(
        { file, title: title.trim() },
        {
          onSuccess: () => {
            onOpenChange(false);
            onSaved?.();
          },
        },
      );
      return;
    }
    saveEdit.mutate();
  };

  const pending = uploadDocument.isPending || saveEdit.isPending;
  const loadingContent = editing && contentQuery.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...(editing ? messages.editTitle : messages.createTitle)} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              {...(editing ? messages.editDescription : messages.createDescription)}
            />
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
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
          {contentEditable ? (
            <Field className="gap-1.5">
              <FieldLabel htmlFor="guideline-text-content">
                <FormattedMessage {...messages.contentLabel} />
              </FieldLabel>
              {loadingContent ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <Textarea
                  id="guideline-text-content"
                  value={content}
                  rows={20}
                  className="min-h-96"
                  onChange={(event) => setContent(event.target.value)}
                  disabled={pending}
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending || loadingContent || contentQuery.isError}
          >
            <FormattedMessage {...messages.save} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
