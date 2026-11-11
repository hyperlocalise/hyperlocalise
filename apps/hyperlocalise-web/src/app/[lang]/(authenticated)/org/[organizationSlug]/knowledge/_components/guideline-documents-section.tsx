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
import { FileTextIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { guidelineDocumentAssignmentsQueryKey } from "./guideline-document-assignments";
import { guidelineDocumentsSectionMessages as messages } from "./guideline-documents-section.messages";
import {
  assignableGuidelinesForProject,
  GuidelineProjectDocumentPicker,
} from "./guideline-project-document-picker";
import { filterProjectVisibleGuidelineDocuments } from "./guideline-project-visible-documents";
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

type GuidelineLinkedProject = { projectId: string; projectName: string };

function GuidelineLinkedProjects({
  organizationSlug,
  linkedProjects,
}: {
  organizationSlug: string;
  linkedProjects: GuidelineLinkedProject[] | null;
}) {
  if (linkedProjects === null) {
    return <FormattedMessage {...messages.allProjects} />;
  }
  if (linkedProjects.length === 0) {
    return <FormattedMessage {...messages.noProjects} />;
  }
  return (
    <>
      {linkedProjects.map((project, index) => (
        <span key={project.projectId}>
          {index > 0 ? ", " : null}
          <Link
            href={buildProjectPath(organizationSlug, project.projectId)}
            className="underline underline-offset-2"
          >
            {project.projectName}
          </Link>
        </span>
      ))}
    </>
  );
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
  showProjectUnassign,
  onEdit,
}: {
  client: GoSvcClient;
  organizationSlug: string;
  projectId?: string;
  document: GuidelineDocument;
  /** Null when the document applies to every project; otherwise linked projects. */
  linkedProjects: GuidelineLinkedProject[] | null;
  canUpdate: boolean;
  showProjectUnassign: boolean;
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
  const unassignFromProject = useMutation({
    mutationFn: async () => {
      if (!projectId) {
        return;
      }
      try {
        await client.guidelines.detachDocumentProject(organizationSlug, document.id, projectId);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.unassignFailed)), {
          cause: error,
        });
      }
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({
        queryKey: guidelineDocumentAssignmentsQueryKey(organizationSlug),
      });
    },
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
            <GuidelineLinkedProjects
              organizationSlug={organizationSlug}
              linkedProjects={linkedProjects}
            />
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
      {showProjectUnassign ? (
        <ItemActions>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unassignFromProject.isPending}
            onClick={() => unassignFromProject.mutate()}
          >
            <FormattedMessage {...messages.unassignFromProject} />
          </Button>
        </ItemActions>
      ) : canUpdate ? (
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

function GuidelineDocumentsEmpty({
  projectScoped,
  showAssignCta,
  createGuidelineHref,
}: {
  projectScoped: boolean;
  /** Org has guidelines that can be assigned to this project (empty project list). */
  showAssignCta?: boolean;
  createGuidelineHref?: string;
}) {
  const title = showAssignCta
    ? messages.emptyProjectAssignableTitle
    : projectScoped
      ? messages.emptyProjectTitle
      : messages.emptyTitle;
  const description = showAssignCta
    ? messages.emptyProjectAssignableDescription
    : projectScoped
      ? messages.emptyProjectDescription
      : messages.emptyDescription;

  return (
    <Empty className="border border-dashed border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileTextIcon />
        </EmptyMedia>
        <EmptyTitle>
          <FormattedMessage {...title} />
        </EmptyTitle>
        <EmptyDescription>
          <FormattedMessage {...description} />
        </EmptyDescription>
      </EmptyHeader>
      {!showAssignCta && createGuidelineHref ? (
        <EmptyContent>
          <Button
            type="button"
            nativeButton={false}
            size="sm"
            render={<Link href={createGuidelineHref} />}
          >
            <PlusIcon data-icon="inline-start" />
            <FormattedMessage {...messages.createGuideline} />
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

function ProjectGuidelineAssign({
  organizationSlug,
  projectId,
  enabled,
  placement,
}: {
  organizationSlug: string;
  projectId: string;
  enabled: boolean;
  placement: "footer" | "inline";
}) {
  if (!enabled) {
    return null;
  }
  return (
    <GuidelineProjectDocumentPicker
      organizationSlug={organizationSlug}
      projectId={projectId}
      placement={placement}
    />
  );
}

export function GuidelineDocumentsSection({
  organizationSlug,
  projectId,
  canUpdate,
  canAssignGuideline,
  createGuidelineHref,
}: {
  organizationSlug: string;
  projectId?: string;
  canUpdate: boolean;
  /** Project page: attach existing org guidelines to this project (workspace writers). */
  canAssignGuideline?: boolean;
  /** When set, the empty list shows a link to the upload page (org writers and project pages). */
  createGuidelineHref?: string;
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
  const orgDocumentsQuery = useQuery({
    queryKey: guidelineDocumentsQueryKey(organizationSlug),
    enabled: !loading && projectId != null,
    queryFn: ({ signal }) =>
      client.guidelines.listDocuments(organizationSlug, undefined, { signal }),
  });

  const assignmentsReady = assignmentsQuery.isSuccess;
  const waitingForProjectAssignments = projectId != null && !assignmentsReady;
  const waitingForOrgDocuments = projectId != null && orgDocumentsQuery.isPending;

  if (loading || query.isPending || waitingForProjectAssignments || waitingForOrgDocuments) {
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
  const linkedProjectsFor = (document: GuidelineDocument): GuidelineLinkedProject[] | null => {
    if (document.isGlobal) return null;
    return (assignedIdsByDocument.get(document.id) ?? []).map((id) => ({
      projectId: id,
      projectName: projectNames.get(id) ?? id,
    }));
  };
  const visibleDocuments =
    projectId == null
      ? query.data
      : filterProjectVisibleGuidelineDocuments(
          query.data,
          projectId,
          assignedIdsByDocument,
          assignmentsReady,
        );
  const projectScoped =
    projectId != null && visibleDocuments.length === 0 && (query.data?.length ?? 0) > 0;
  const assignableToProjectCount =
    projectId && assignmentsReady
      ? assignableGuidelinesForProject(
          orgDocumentsQuery.data ?? [],
          assignedIdsByDocument,
          projectId,
        ).length
      : 0;
  const showAssignEmpty = Boolean(
    projectId &&
    canAssignGuideline &&
    visibleDocuments.length === 0 &&
    assignableToProjectCount > 0,
  );

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
      {visibleDocuments.length === 0 ? (
        <div className="flex flex-col gap-4">
          <GuidelineDocumentsEmpty
            projectScoped={projectScoped}
            showAssignCta={showAssignEmpty}
            createGuidelineHref={createGuidelineHref}
          />
          {showAssignEmpty ? (
            <ProjectGuidelineAssign
              organizationSlug={organizationSlug}
              projectId={projectId!}
              enabled
              placement="inline"
            />
          ) : null}
        </div>
      ) : (
        <ItemGroup className="gap-2">
          {visibleDocuments.map((document) => {
            const assignedToProject =
              projectId != null &&
              (assignedIdsByDocument.get(document.id) ?? []).includes(projectId);
            const showProjectUnassign = Boolean(
              canAssignGuideline &&
              projectId &&
              assignedToProject &&
              !(document.isGlobal ?? false) &&
              document.projectId == null,
            );
            return (
              <GuidelineDocumentRow
                key={document.id}
                client={client}
                organizationSlug={organizationSlug}
                projectId={projectId}
                document={document}
                linkedProjects={linkedProjectsFor(document)}
                canUpdate={canUpdate}
                showProjectUnassign={showProjectUnassign}
                onEdit={setEditingDocument}
              />
            );
          })}
        </ItemGroup>
      )}
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
      {projectId && visibleDocuments.length > 0 ? (
        <ProjectGuidelineAssign
          organizationSlug={organizationSlug}
          projectId={projectId}
          enabled={canAssignGuideline ?? false}
          placement="footer"
        />
      ) : null}
    </section>
  );
}
