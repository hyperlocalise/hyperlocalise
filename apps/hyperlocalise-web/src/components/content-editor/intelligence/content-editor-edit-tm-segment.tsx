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
import { useEffect, useState } from "react";
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { contentEditorIntelligencePanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorTmSegmentRef,
  ContentEditorTranslationMemoryMatch,
} from "@/components/content-editor/shared/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { formatLocaleDisplayName } from "@/lib/i18n/locale-display-names.messages";
import type { ContentEditorTmSegment } from "@/lib/translation/content-editor-tm-segment";

function draftKey(record: { id: string; locale: string }) {
  return `${record.id}:${record.locale}`;
}

function draftsFromSegment(segment: ContentEditorTmSegment) {
  const drafts: Record<string, string> = {};
  for (const record of [segment.source, ...segment.records]) {
    drafts[draftKey(record)] = record.text;
  }
  return drafts;
}

export function ContentEditorEditTmSegmentButton({
  match,
  organizationSlug,
  projectId,
  sourceLocale,
  onMutated,
}: {
  match: ContentEditorTranslationMemoryMatch;
  organizationSlug: string;
  projectId: string;
  sourceLocale: string;
  onMutated?: () => void;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);

  if (!match.canEdit || !match.segmentRef) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label={intl.formatMessage(contentEditorIntelligencePanelMessages.editTmSegment)}
        onClick={() => setOpen(true)}
      >
        <PencilSimpleIcon className="size-4" />
      </Button>
      {open ? (
        <ContentEditorEditTmSegmentDialog
          match={match}
          segmentRef={match.segmentRef}
          organizationSlug={organizationSlug}
          projectId={projectId}
          sourceLocale={sourceLocale}
          onOpenChange={setOpen}
          onMutated={onMutated}
        />
      ) : null}
    </>
  );
}

function ContentEditorEditTmSegmentDialog({
  match,
  segmentRef,
  organizationSlug,
  projectId,
  sourceLocale,
  onOpenChange,
  onMutated,
}: {
  match: ContentEditorTranslationMemoryMatch;
  segmentRef: ContentEditorTmSegmentRef;
  organizationSlug: string;
  projectId: string;
  sourceLocale: string;
  onOpenChange: (open: boolean) => void;
  onMutated?: () => void;
}) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const [segment, setSegment] = useState<ContentEditorTmSegment | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    ContentEditorTmSegment["records"][number] | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await loadTmSegment({
          client,
          organizationSlug,
          projectId,
          sourceLocale,
          segmentRef,
        });
        if (cancelled) {
          return;
        }
        setSegment(next);
        setDrafts(draftsFromSegment(next));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : intl.formatMessage(contentEditorIntelligencePanelMessages.editTmSegmentLoadFailed),
        );
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [client, intl, organizationSlug, projectId, segmentRef, sourceLocale]);

  const sourceText = segment ? (drafts[draftKey(segment.source)] ?? segment.source.text) : "";

  async function handleSave() {
    if (!segment) {
      return;
    }
    if (!sourceText.trim()) {
      setFormError(
        intl.formatMessage(contentEditorIntelligencePanelMessages.editTmSegmentSourceRequired),
      );
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      await saveTmSegment({
        client,
        organizationSlug,
        projectId,
        sourceLocale,
        segmentRef,
        sourceText,
        segment,
        drafts,
      });
      toast.success(intl.formatMessage(contentEditorIntelligencePanelMessages.editTmSegmentSaved));
      onOpenChange(false);
      onMutated?.();
    } catch (error) {
      setFormError(
        goSvcErrorMessage(
          error,
          error instanceof Error
            ? error.message
            : intl.formatMessage(contentEditorIntelligencePanelMessages.editTmSegmentSaveFailed),
        ),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!segment || !pendingDelete) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteTmSegmentRecord({
        client,
        organizationSlug,
        projectId,
        sourceLocale,
        segmentRef,
        recordId: pendingDelete.id,
      });
      toast.success(
        intl.formatMessage(contentEditorIntelligencePanelMessages.deleteTmLocaleDeleted),
      );
      setPendingDelete(null);
      onOpenChange(false);
      onMutated?.();
    } catch (error) {
      setFormError(
        goSvcErrorMessage(
          error,
          error instanceof Error
            ? error.message
            : intl.formatMessage(contentEditorIntelligencePanelMessages.deleteTmLocaleFailed),
        ),
      );
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...contentEditorIntelligencePanelMessages.editTmSegment} />
            </DialogTitle>
          </DialogHeader>
          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : !segment ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-5" />
            </div>
          ) : (
            <FieldGroup>
              {segment.records.map((record) => {
                const localeLabel = formatLocaleDisplayName(intl, record.locale);
                return (
                  <Field key={`${record.id}:${record.locale}`}>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor={`tm-segment-${record.id}-${record.locale}`}>
                        {localeLabel}
                      </FieldLabel>
                      {record.isSource || !match.canDelete ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={intl.formatMessage(
                            contentEditorIntelligencePanelMessages.deleteTmLocale,
                          )}
                          onClick={() => setPendingDelete(record)}
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                      )}
                    </div>
                    <Textarea
                      id={`tm-segment-${record.id}-${record.locale}`}
                      value={drafts[draftKey(record)] ?? record.text}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setDrafts((current) => ({ ...current, [draftKey(record)]: value }));
                      }}
                      rows={2}
                    />
                  </Field>
                );
              })}
              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            </FieldGroup>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <FormattedMessage {...contentEditorIntelligencePanelMessages.editTmSegmentCancel} />
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={!segment || isSaving}>
              {isSaving ? <Spinner className="size-4" /> : null}
              <FormattedMessage {...contentEditorIntelligencePanelMessages.editTmSegmentSave} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...contentEditorIntelligencePanelMessages.deleteTmLocaleTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage
                {...contentEditorIntelligencePanelMessages.deleteTmLocaleDescription}
                values={{
                  locale: pendingDelete ? formatLocaleDisplayName(intl, pendingDelete.locale) : "",
                }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...contentEditorIntelligencePanelMessages.editTmSegmentCancel} />
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={isDeleting}>
              <FormattedMessage {...contentEditorIntelligencePanelMessages.deleteTmLocaleConfirm} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

async function loadTmSegment(input: {
  client: ReturnType<typeof useGoSvcClient>["client"];
  organizationSlug: string;
  projectId: string;
  sourceLocale: string;
  segmentRef: ContentEditorTmSegmentRef;
}): Promise<ContentEditorTmSegment> {
  if (input.segmentRef.kind === "native") {
    const response = await input.client.cat.tmSegment(
      input.organizationSlug,
      input.projectId,
      input.segmentRef.entryId,
    );
    return response.tmSegment;
  }

  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat["tm-segments"].$get({
    param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
    query: {
      kind: "external",
      providerKind: "crowdin",
      resourceId: input.segmentRef.resourceId,
      externalResourceId: input.segmentRef.externalResourceId,
      externalSegmentId: input.segmentRef.externalSegmentId,
      sourceLocale: input.sourceLocale,
    },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Unable to load the TM segment"));
  }
  const body = await response.json();
  if (!("tmSegment" in body)) {
    throw new Error("Unable to load the TM segment");
  }
  return body.tmSegment;
}

async function saveTmSegment(input: {
  client: ReturnType<typeof useGoSvcClient>["client"];
  organizationSlug: string;
  projectId: string;
  sourceLocale: string;
  segmentRef: ContentEditorTmSegmentRef;
  sourceText: string;
  segment: ContentEditorTmSegment;
  drafts: Record<string, string>;
}) {
  const records = input.segment.records
    .filter((record) => !record.isSource)
    .map((record) => ({
      id: record.id,
      text: input.drafts[draftKey(record)] ?? record.text,
      expectedVersion: record.version ?? 1,
    }));

  if (input.segmentRef.kind === "native") {
    await input.client.cat.updateTmSegment(
      input.organizationSlug,
      input.projectId,
      input.segmentRef.entryId,
      { sourceText: input.sourceText, records },
    );
    return;
  }

  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat["tm-segments"].$patch({
    param: { organizationSlug: input.organizationSlug, projectId: input.projectId },
    json: {
      kind: "external",
      providerKind: "crowdin",
      resourceId: input.segmentRef.resourceId,
      externalResourceId: input.segmentRef.externalResourceId,
      externalSegmentId: input.segmentRef.externalSegmentId,
      sourceLocale: input.sourceLocale,
      sourceText: input.sourceText,
      records: records.map(({ id, text }) => ({ id, text })),
    },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Unable to save the TM segment"));
  }
}

async function deleteTmSegmentRecord(input: {
  client: ReturnType<typeof useGoSvcClient>["client"];
  organizationSlug: string;
  projectId: string;
  sourceLocale: string;
  segmentRef: ContentEditorTmSegmentRef;
  recordId: string;
}) {
  if (input.segmentRef.kind === "native") {
    await input.client.cat.deleteTmSegmentRecord(
      input.organizationSlug,
      input.projectId,
      input.segmentRef.entryId,
      input.recordId,
    );
    return;
  }

  const response = await apiClient.api.orgs[":organizationSlug"].projects[
    ":projectId"
  ].files.detail.cat["tm-segments"].records[":recordId"].$delete({
    param: {
      organizationSlug: input.organizationSlug,
      projectId: input.projectId,
      recordId: input.recordId,
    },
    query: {
      kind: "external",
      providerKind: "crowdin",
      resourceId: input.segmentRef.resourceId,
      externalResourceId: input.segmentRef.externalResourceId,
      externalSegmentId: input.segmentRef.externalSegmentId,
      sourceLocale: input.sourceLocale,
    },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "Unable to delete this locale from the TM"));
  }
}
