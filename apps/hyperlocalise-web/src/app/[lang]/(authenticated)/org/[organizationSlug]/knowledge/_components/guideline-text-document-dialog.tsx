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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  onSaved?: (documentId?: string) => void;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client, loading } = useGoSvcClient();
  const editing = document != null;
  const [title, setTitle] = useState(document?.title ?? "");
  const [content, setContent] = useState("");
  const [localesInput, setLocalesInput] = useState(
    (document?.locales ?? (document?.locale ? [document.locale] : [])).join(", "),
  );
  const [isGlobal, setIsGlobal] = useState(document?.isGlobal ?? false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [localesError, setLocalesError] = useState<string | null>(null);

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
      setLocalesInput(
        (document?.locales ?? (document?.locale ? [document.locale] : [])).join(", "),
      );
      setIsGlobal(document?.isGlobal ?? false);
      setTitleError(null);
      setContentError(null);
      setLocalesError(null);
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

  const parseLocales = (): string[] | null => {
    const parts = localesInput
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.some((part) => part.length > 35 || !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    return [...new Set(parts)];
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim();
      const locales = parseLocales() ?? [];
      const titleChanged = trimmedTitle !== document!.title;
      const localesChanged =
        JSON.stringify(locales) !==
        JSON.stringify(document!.locales ?? (document!.locale ? [document!.locale] : []));
      const globalChanged = isGlobal !== document!.isGlobal;
      const contentChanged =
        contentEditable && contentQuery.data != null && content !== loadedContent;
      if (contentChanged) {
        const file = markdownFile(trimmedTitle, content);
        await client.guidelines.replaceDocument(
          organizationSlug,
          document!.id,
          { file, filename: file.name, title: trimmedTitle, locales, isGlobal },
          projectId,
        );
      } else if (titleChanged || localesChanged || globalChanged) {
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
    if (!contentEditable) {
      setContentError(null);
    } else if (!content.trim()) {
      setContentError(intl.formatMessage(messages.contentRequired));
    } else if (content.length > CONTENT_MAX_LENGTH) {
      setContentError(intl.formatMessage(messages.contentTooLong));
    } else {
      setContentError(null);
    }
    const locales = parseLocales();
    if (locales == null) {
      setLocalesError(intl.formatMessage(messages.localesInvalid));
    } else {
      setLocalesError(null);
    }
    const titleOk = !!trimmedTitle && trimmedTitle.length <= TITLE_MAX_LENGTH;
    const contentOk =
      !contentEditable || (!!content.trim() && content.length <= CONTENT_MAX_LENGTH);
    return titleOk && contentOk && locales != null;
  };

  const handleSave = () => {
    if (!validate()) return;
    const locales = parseLocales() ?? [];
    if (!editing) {
      const file = markdownFile(title.trim(), content);
      uploadDocument.mutate(
        { file, title: title.trim(), locales, isGlobal },
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
  const loadingContent = editing && contentQuery.isPending;

  const applyTemplate = () => {
    setContent(GUIDELINE_TEMPLATE_CONTENT);
    setContentError(null);
    if (!title.trim()) {
      setTitle(GUIDELINE_TEMPLATE_TITLE);
      setTitleError(null);
    }
  };

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
          <Field className="gap-1.5">
            <FieldLabel htmlFor="guideline-text-locales">
              <FormattedMessage {...messages.localesLabel} />
            </FieldLabel>
            <Input
              id="guideline-text-locales"
              value={localesInput}
              placeholder={intl.formatMessage(messages.localesPlaceholder)}
              onChange={(event) => setLocalesInput(event.target.value)}
              disabled={pending || loadingContent}
            />
            {localesError ? <FieldError>{localesError}</FieldError> : null}
          </Field>
          <Field className="gap-1.5">
            <div className="flex items-center gap-2">
              <Switch
                id="guideline-text-global"
                size="sm"
                checked={isGlobal}
                onCheckedChange={setIsGlobal}
                disabled={pending || loadingContent}
              />
              <FieldLabel htmlFor="guideline-text-global">
                <FormattedMessage {...messages.globalLabel} />
              </FieldLabel>
            </div>
          </Field>
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
