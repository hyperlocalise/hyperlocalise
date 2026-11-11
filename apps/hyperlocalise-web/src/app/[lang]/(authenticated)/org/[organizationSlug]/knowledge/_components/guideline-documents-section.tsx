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
import { useId, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";
import { toast } from "sonner";

import { buildOrganizationPath, buildProjectPath } from "@/components/app-shell/navigation-config";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { guidelineDocumentsSectionMessages as messages } from "./guideline-documents-section.messages";
import { GuidelineTextDocumentDialog } from "./guideline-text-document-dialog";

const PROCESSING_POLL_MS = 3000;
const ENQUEUE_RECOVERY_POLL_MS = 15_000;

/** Transient SQS publish failure; go-svc sweep moves these back to processing. */
export const GUIDELINE_INGEST_ENQUEUE_FAILED = "guideline_ingest_enqueue_failed";

export function guidelineDocumentIsIndexing(document: GuidelineDocument): boolean {
  return document.status === "ready" && !document.indexed;
}

export function guidelineDocumentDisplayStatus(
  document: GuidelineDocument,
): GuidelineDocument["status"] {
  if (guidelineDocumentIsIndexing(document)) {
    return "processing";
  }
  return document.status;
}

export function guidelineDocumentsRefetchInterval(
  documents: GuidelineDocument[] | undefined,
): number | false {
  if (!documents) {
    return false;
  }
  if (
    documents.some(
      (document) => document.status === "processing" || guidelineDocumentIsIndexing(document),
    )
  ) {
    return PROCESSING_POLL_MS;
  }
  if (
    documents.some(
      (document) =>
        document.status === "failed" && document.errorCode === GUIDELINE_INGEST_ENQUEUE_FAILED,
    )
  ) {
    return ENQUEUE_RECOVERY_POLL_MS;
  }
  return false;
}

export function guidelineDocumentsQueryKey(organizationSlug: string, projectId?: string) {
  return ["guideline-documents", organizationSlug, projectId ?? null] as const;
}

function errorMessage(code: string | null): MessageDescriptor {
  switch (code) {
    case "no_text":
      return messages.errorNoText;
    case "unsupported_format":
      return messages.errorUnsupported;
    case "too_large":
      return messages.errorTooLarge;
    case "encrypted":
      return messages.errorEncrypted;
    case "malformed":
      return messages.errorMalformed;
    case GUIDELINE_INGEST_ENQUEUE_FAILED:
      return messages.errorEnqueueRetrying;
    default:
      return messages.errorGeneric;
  }
}

function StatusBadge({ status }: { status: GuidelineDocument["status"] }) {
  if (status === "ready") {
    return (
      <Badge variant="outline">
        <FormattedMessage {...messages.ready} />
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive">
        <FormattedMessage {...messages.failed} />
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <FormattedMessage {...messages.processing} />
    </Badge>
  );
}

/** Uploads one file and refreshes the matching document list. */
export function useGuidelineDocumentUpload(organizationSlug: string, projectId?: string) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client } = useGoSvcClient();

  return useMutation({
    mutationFn: (
      input: File | { file: File; title?: string; locales?: string[]; isGlobal?: boolean },
    ) => {
      const file = input instanceof File ? input : input.file;
      const title = input instanceof File ? undefined : input.title;
      const locales = input instanceof File ? undefined : input.locales;
      const isGlobal = input instanceof File ? undefined : input.isGlobal;
      return client.guidelines.uploadDocument(
        organizationSlug,
        {
          file,
          filename: file.name,
          ...(title === undefined ? {} : { title }),
          ...(locales === undefined ? {} : { locales }),
          ...(isGlobal === undefined ? {} : { isGlobal }),
        },
        // projectId is deprecated; project targeting uses assignments.
        undefined,
      );
    },
    onSuccess: (_document, input) => {
      const file = input instanceof File ? input : input.file;
      toast.success(intl.formatMessage(messages.uploadStarted, { filename: file.name }));
    },
    onError: (error, input) => {
      const file = input instanceof File ? input : input.file;
      toast.error(intl.formatMessage(messages.uploadFailed, { filename: file.name }), {
        description: error.message,
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: guidelineDocumentsQueryKey(organizationSlug, projectId),
      }),
  });
}

function GuidelineDocumentRow({
  client,
  organizationSlug,
  projectId,
  document,
  linkedProjects,
  canUpdate,
  onEdit,
}: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId?: string;
  document: GuidelineDocument;
  /** Null when the document applies to every project; otherwise linked names. */
  linkedProjects: string[] | null;
  canUpdate: boolean;
  onEdit: (document: GuidelineDocument) => void;
}) {
  const intl = useIntl();
  const switchId = useId();
  const queryClient = useQueryClient();
  const queryKey = guidelineDocumentsQueryKey(organizationSlug, projectId);

  const updateMandatory = useMutation({
    mutationFn: (mandatory: boolean) =>
      client.guidelines.updateDocument(organizationSlug, document.id, { mandatory }, projectId),
    onError: () => toast.error(intl.formatMessage(messages.updateFailed)),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: () => client.guidelines.deleteDocument(organizationSlug, document.id, projectId),
    onError: () => toast.error(intl.formatMessage(messages.deleteFailed)),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const mandatory = updateMandatory.isPending
    ? (updateMandatory.variables ?? document.mandatory)
    : document.mandatory;
  const detailHref = projectId
    ? buildProjectPath(organizationSlug, projectId, `knowledge/${encodeURIComponent(document.id)}`)
    : buildOrganizationPath(organizationSlug, `knowledge/${encodeURIComponent(document.id)}`);

  return (
    <Item variant="outline" size="sm">
      <ItemContent className="min-w-0">
        <ItemTitle className="flex flex-wrap items-center gap-2">
          <Link href={detailHref} className="truncate hover:underline">
            {document.title}
          </Link>
          <StatusBadge status={guidelineDocumentDisplayStatus(document)} />
        </ItemTitle>
        <ItemDescription className="flex flex-wrap gap-x-2">
          <span className="truncate">{document.filename}</span>
          <span aria-hidden="true">·</span>
          <span>
            {(() => {
              const locales = document.locales ?? (document.locale ? [document.locale] : []);
              return locales.length > 0 ? (
                locales.join(", ")
              ) : (
                <FormattedMessage {...messages.allLocales} />
              );
            })()}
          </span>
          <span aria-hidden="true">·</span>
          <span className="truncate">
            {linkedProjects === null ? (
              <FormattedMessage {...messages.allProjects} />
            ) : linkedProjects.length > 0 ? (
              linkedProjects.join(", ")
            ) : (
              <FormattedMessage {...messages.noProjects} />
            )}
          </span>
          {document.status === "ready" && document.indexed ? (
            <>
              <span aria-hidden="true">·</span>
              <FormattedMessage
                {...messages.characters}
                values={{ count: document.characterCount }}
              />
            </>
          ) : null}
        </ItemDescription>
        {document.status === "failed" ? (
          <p className="text-xs text-destructive">
            <FormattedMessage {...errorMessage(document.errorCode)} />
          </p>
        ) : null}
        {document.status === "ready" && document.indexed && document.truncated ? (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...messages.truncated} />
          </p>
        ) : null}
      </ItemContent>
      {canUpdate ? (
        <ItemActions>
          <label
            htmlFor={switchId}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Switch
              id={switchId}
              size="sm"
              checked={mandatory}
              disabled={updateMandatory.isPending || document.status === "failed"}
              onCheckedChange={(checked) => updateMandatory.mutate(checked)}
            />
            <FormattedMessage {...messages.alwaysApply} />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={intl.formatMessage(messages.edit)}
            onClick={() => onEdit(document)}
          >
            <PencilSimpleIcon />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={intl.formatMessage(messages.delete)}
                  disabled={remove.isPending}
                />
              }
            >
              <TrashIcon />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <FormattedMessage {...messages.deleteTitle} />
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <FormattedMessage {...messages.deleteBody} values={{ title: document.title }} />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <FormattedMessage {...messages.cancel} />
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                >
                  <FormattedMessage {...messages.delete} />
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ItemActions>
      ) : null}
    </Item>
  );
}

export function GuidelineDocumentsSection({
  organizationSlug,
  projectId,
  canUpdate,
}: {
  organizationSlug: string;
  projectId?: string;
  canUpdate: boolean;
}) {
  const { client, loading } = useGoSvcClient();
  const [editingDocument, setEditingDocument] = useState<GuidelineDocument | null>(null);
  const query = useQuery({
    queryKey: guidelineDocumentsQueryKey(organizationSlug, projectId),
    enabled: !loading,
    queryFn: ({ signal }) =>
      client.guidelines.listDocuments(organizationSlug, projectId, { signal }),
    refetchInterval: (current) => guidelineDocumentsRefetchInterval(current.state.data),
  });
  // Project views filter server-side (?project= keeps global + assigned docs).
  // The client-side check below stays as a backup for cached unfiltered data.
  // Assignments and project names are always loaded so each row can show its
  // linked projects. The query keys match the assignments section so
  // observers share cache.
  const assignmentsQuery = useQuery({
    queryKey: ["guideline-document-assignments", organizationSlug],
    enabled: !loading,
    queryFn: ({ signal }) =>
      client.guidelines.listAllDocumentAssignments(organizationSlug, { signal }),
  });
  const projectsQuery = useQuery({
    queryKey: ["guideline-assignment-projects", organizationSlug],
    enabled: !loading,
    queryFn: ({ signal }) => client.project.list(organizationSlug, { signal }),
  });

  if (loading || query.isPending) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (query.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
        <FormattedMessage {...messages.loadFailed} />
        <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
          <FormattedMessage {...messages.retry} />
        </Button>
      </div>
    );
  }
  const assignedIdsByDocument = new Map(
    (assignmentsQuery.data?.assignments ?? []).map((entry) => [entry.documentId, entry.projectIds]),
  );
  const projectNames = new Map(
    (projectsQuery.data?.projects ?? []).map((project) => [project.id, project.name]),
  );
  // Null marks a document that applies to every project; otherwise the
  // linked project names (falling back to ids while names load).
  const linkedProjectsFor = (document: GuidelineDocument): string[] | null => {
    if (document.isGlobal ?? true) return null;
    return (assignedIdsByDocument.get(document.id) ?? []).map(
      (projectId) => projectNames.get(projectId) ?? projectId,
    );
  };
  const visibleDocuments =
    projectId == null
      ? query.data
      : query.data.filter(
          (document) =>
            linkedProjectsFor(document) === null ||
            (assignedIdsByDocument.get(document.id) ?? []).includes(projectId),
        );
  if (visibleDocuments.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-base font-medium text-foreground">
          <FormattedMessage {...messages.title} />
        </h2>
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.description} />
        </p>
      </div>
      <ItemGroup className="gap-2">
        {visibleDocuments.map((document) => (
          <GuidelineDocumentRow
            key={document.id}
            client={client}
            organizationSlug={organizationSlug}
            projectId={projectId}
            document={document}
            linkedProjects={linkedProjectsFor(document)}
            canUpdate={canUpdate}
            onEdit={setEditingDocument}
          />
        ))}
      </ItemGroup>
      {canUpdate ? (
        <GuidelineTextDocumentDialog
          open={editingDocument != null}
          onOpenChange={(open) => {
            if (!open) setEditingDocument(null);
          }}
          organizationSlug={organizationSlug}
          projectId={projectId}
          document={editingDocument}
        />
      ) : null}
    </section>
  );
}
