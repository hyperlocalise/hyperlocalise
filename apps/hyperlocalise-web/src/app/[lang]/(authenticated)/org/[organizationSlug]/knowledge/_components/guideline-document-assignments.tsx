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
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import type { GuidelineProjectAssignment } from "@/lib/go-svc/go-svc-guidelines-api";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { guidelineDocumentAssignmentsMessages as messages } from "./guideline-document-assignments.messages";

export function guidelineDocumentAssignmentsQueryKey(organizationSlug: string) {
  return ["guideline-document-assignments", organizationSlug] as const;
}

export function guidelineAssignmentProjectsQueryKey(organizationSlug: string) {
  return ["guideline-assignment-projects", organizationSlug] as const;
}

function ScopeBadge({ isGlobal, projectIds }: { isGlobal: boolean; projectIds: string[] }) {
  if (isGlobal) {
    return (
      <Badge variant="outline">
        <FormattedMessage {...messages.allProjects} />
      </Badge>
    );
  }
  if (projectIds.length === 0) {
    return (
      <Badge variant="outline">
        <FormattedMessage {...messages.noProjects} />
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <FormattedMessage {...messages.selectedProjects} values={{ count: projectIds.length }} />
    </Badge>
  );
}

function ProjectPicker({
  organizationSlug,
  assignedIds,
  onAssign,
  pending,
}: {
  organizationSlug: string;
  assignedIds: Set<string>;
  onAssign: (projectId: string) => void;
  pending: boolean;
}) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const [selected, setSelected] = useState<string>("");
  const projectsQuery = useQuery({
    queryKey: guidelineAssignmentProjectsQueryKey(organizationSlug),
    queryFn: ({ signal }) => client.project.list(organizationSlug, { signal }),
  });
  const projectNames = useMemo(
    () =>
      new Map((projectsQuery.data?.projects ?? []).map((project) => [project.id, project.name])),
    [projectsQuery.data],
  );
  const available = [...projectNames.entries()]
    .filter(([id]) => !assignedIds.has(id))
    .map(([id, name]) => ({ id, name }));
  const selectedName = selected ? (projectNames.get(selected) ?? selected) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selected} onValueChange={(value) => setSelected(value ?? "")}>
        <SelectTrigger className="w-56">
          {selectedName ? (
            <span className="truncate">{selectedName}</span>
          ) : (
            <SelectValue placeholder={intl.formatMessage(messages.selectProject)} />
          )}
        </SelectTrigger>
        <SelectContent>
          {available.map((project) => (
            <SelectItem key={project.id} value={project.id} label={project.name}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        disabled={!selected || pending}
        onClick={() => {
          onAssign(selected);
          setSelected("");
        }}
      >
        <FormattedMessage {...messages.assign} />
      </Button>
    </div>
  );
}

/**
 * Project assignment section for a single org-wide guideline document.
 * Project-owned documents are implicitly scoped and do not render this.
 */
export function GuidelineDocumentAssignments({
  organizationSlug,
  documentId,
  canUpdate,
}: {
  organizationSlug: string;
  documentId: string;
  canUpdate: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client, loading } = useGoSvcClient();

  const assignmentsQuery = useQuery({
    queryKey: guidelineDocumentAssignmentsQueryKey(organizationSlug),
    enabled: !loading,
    queryFn: ({ signal }) =>
      client.guidelines.listAllDocumentAssignments(organizationSlug, { signal }),
  });
  const projectsQuery = useQuery({
    queryKey: guidelineAssignmentProjectsQueryKey(organizationSlug),
    enabled: !loading,
    queryFn: ({ signal }) => client.project.list(organizationSlug, { signal }),
  });
  const assignmentIdsByDocument = useMemo(
    () =>
      new Map(
        (assignmentsQuery.data?.assignments ?? []).map(
          (entry) => [entry.documentId, entry.projectIds] as const,
        ),
      ),
    [assignmentsQuery.data],
  );
  const projectNames = useMemo(
    () =>
      new Map((projectsQuery.data?.projects ?? []).map((project) => [project.id, project.name])),
    [projectsQuery.data],
  );
  const documentQuery = useQuery({
    // Single-document fetch for scope display; shares the detail page's
    // ["guideline-document", org, undefined, id] cache entry.
    queryKey: ["guideline-document", organizationSlug, undefined, documentId],
    enabled: !loading,
    queryFn: async ({ signal }) =>
      client.guidelines.getDocument(organizationSlug, documentId, undefined, { signal }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: guidelineDocumentAssignmentsQueryKey(organizationSlug),
    });
  };

  const attachDocument = useMutation({
    mutationFn: async (projectId: string) => {
      try {
        await client.guidelines.attachDocumentProject(organizationSlug, documentId, projectId);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.assignFailed)), {
          cause: error,
        });
      }
    },
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });
  const detachDocument = useMutation({
    mutationFn: async (projectId: string) => {
      try {
        await client.guidelines.detachDocumentProject(organizationSlug, documentId, projectId);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.removeFailed)), {
          cause: error,
        });
      }
    },
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });
  const setGlobal = useMutation({
    mutationFn: async (isGlobal: boolean) => {
      try {
        await client.guidelines.updateDocument(organizationSlug, documentId, { isGlobal });
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.assignFailed)), {
          cause: error,
        });
      }
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({
        queryKey: ["guideline-document", organizationSlug, undefined, documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["guideline-documents", organizationSlug],
      });
    },
    onError: (error) => toast.error(error.message),
  });

  if (loading || assignmentsQuery.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (assignmentsQuery.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
        <FormattedMessage {...messages.loadFailed} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void assignmentsQuery.refetch()}
        >
          <FormattedMessage {...messages.retry} />
        </Button>
      </div>
    );
  }

  const projectIds = assignmentIdsByDocument.get(documentId) ?? [];
  const assigned: GuidelineProjectAssignment[] = projectIds.map((projectId) => ({
    projectId,
    projectName: projectNames.get(projectId) ?? projectId,
  }));
  const assignedIds = new Set(assigned.map((p) => p.projectId));
  const isGlobal = documentQuery.data?.isGlobal ?? false;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TypographyH2 className="pb-0 text-lg tracking-[-0.02em]">
          <FormattedMessage {...messages.sectionTitle} />
        </TypographyH2>
        <ScopeBadge isGlobal={isGlobal} projectIds={projectIds} />
      </div>
      <TypographyP size="small" tone="subtle" className="max-w-2xl leading-6">
        <FormattedMessage {...messages.sectionDescription} />
      </TypographyP>
      {canUpdate ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isGlobal}
            disabled={setGlobal.isPending}
            onChange={(event) => setGlobal.mutate(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <FormattedMessage {...messages.allProjects} />
        </label>
      ) : null}
      <div className="rounded-xl border border-border px-4 py-3">
        <div className="grid gap-2">
          {assigned.map((project) => (
            <div
              key={project.projectId}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <Link
                href={buildProjectPath(organizationSlug, project.projectId)}
                className="text-sm font-medium text-foreground underline underline-offset-2"
              >
                {project.projectName}
              </Link>
              {canUpdate ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => detachDocument.mutate(project.projectId)}
                  aria-label={intl.formatMessage(messages.remove)}
                >
                  <FormattedMessage {...messages.remove} />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        {canUpdate && !isGlobal ? (
          <div className="mt-3">
            <ProjectPicker
              organizationSlug={organizationSlug}
              assignedIds={assignedIds}
              onAssign={(projectId) => attachDocument.mutate(projectId)}
              pending={attachDocument.isPending}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
