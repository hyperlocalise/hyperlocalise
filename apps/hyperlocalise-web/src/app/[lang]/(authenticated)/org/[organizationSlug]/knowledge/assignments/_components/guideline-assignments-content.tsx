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
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { buildOrganizationPath } from "@/components/app-shell/navigation-config";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import type {
  GuidelineDocument,
  GuidelineProjectAssignment,
} from "@/lib/go-svc/go-svc-guidelines-api";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { guidelineAssignmentsMessages as messages } from "./guideline-assignments.messages";

function ScopeBadge({ projectIds }: { projectIds: string[] }) {
  if (projectIds.length === 0) {
    return (
      <Badge variant="outline">
        <FormattedMessage {...messages.allProjects} />
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
    queryKey: ["guideline-assignment-projects", organizationSlug],
    queryFn: async ({ signal }) => {
      const body = await client.project.list(organizationSlug, { signal });
      // Same Map shape as the parent query sharing this key, so both
      // observers read identical cached data regardless of fetch order.
      return new Map(body.projects.map((project) => [project.id, project.name] as const));
    },
  });
  const available = [...(projectsQuery.data ?? new Map<string, string>()).entries()]
    .filter(([id]) => !assignedIds.has(id))
    .map(([id, name]) => ({ id, name }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selected} onValueChange={(value) => setSelected(value ?? "")}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder={intl.formatMessage(messages.selectProject)} />
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

function AssignmentRow({
  organizationSlug,
  title,
  assigned,
  canUpdate,
  onAttach,
  onDetach,
  attachPending,
}: {
  organizationSlug: string;
  title: string;
  assigned: GuidelineProjectAssignment[];
  canUpdate: boolean;
  onAttach: (projectId: string) => void;
  onDetach: (projectId: string) => void;
  attachPending: boolean;
}) {
  const intl = useIntl();
  const assignedIds = useMemo(() => new Set(assigned.map((p) => p.projectId)), [assigned]);
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <ScopeBadge projectIds={assigned.map((p) => p.projectId)} />
      </div>
      <div className="mt-3 grid gap-2">
        {assigned.map((project) => (
          <div
            key={project.projectId}
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <Link
              href={`/org/${organizationSlug}/projects/${project.projectId}`}
              className="text-sm font-medium text-foreground hover:underline"
            >
              {project.projectName}
            </Link>
            {canUpdate ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onDetach(project.projectId)}
                aria-label={intl.formatMessage(messages.remove)}
              >
                <FormattedMessage {...messages.remove} />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {canUpdate ? (
        <div className="mt-3">
          <ProjectPicker
            organizationSlug={organizationSlug}
            assignedIds={assignedIds}
            onAssign={onAttach}
            pending={attachPending}
          />
        </div>
      ) : null}
    </div>
  );
}

export function GuidelineAssignmentsContent({
  organizationSlug,
  canUpdate,
}: {
  organizationSlug: string;
  canUpdate: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client, loading } = useGoSvcClient();

  const documentsQuery = useQuery({
    queryKey: ["guideline-documents", organizationSlug],
    enabled: !loading,
    queryFn: ({ signal }) =>
      client.guidelines.listDocuments(organizationSlug, undefined, { signal }),
  });
  const assignmentsQuery = useQuery({
    queryKey: ["guideline-document-assignments", organizationSlug],
    enabled: !loading,
    queryFn: async ({ signal }) => {
      const body = await client.guidelines.listAllDocumentAssignments(organizationSlug, { signal });
      return new Map(body.assignments.map((a) => [a.documentId, a.projectIds] as const));
    },
  });
  const projectsQuery = useQuery({
    queryKey: ["guideline-assignment-projects", organizationSlug],
    enabled: !loading,
    queryFn: async ({ signal }) => {
      const body = await client.project.list(organizationSlug, { signal });
      return new Map(body.projects.map((p) => [p.id, p.name] as const));
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["guideline-document-assignments", organizationSlug],
    });
  };

  const attachDocument = useMutation({
    mutationFn: async ({ documentId, projectId }: { documentId: string; projectId: string }) => {
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
    mutationFn: async ({ documentId, projectId }: { documentId: string; projectId: string }) => {
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

  if (loading || documentsQuery.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (documentsQuery.isError || assignmentsQuery.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
        <FormattedMessage {...messages.loadFailed} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void documentsQuery.refetch();
            void assignmentsQuery.refetch();
          }}
        >
          <FormattedMessage {...messages.retry} />
        </Button>
      </div>
    );
  }

  const orgWide: GuidelineDocument[] = (documentsQuery.data ?? []).filter(
    (doc) => doc.projectId == null,
  );
  const byDocument = assignmentsQuery.data ?? new Map<string, string[]>();
  const projectNames = projectsQuery.data ?? new Map<string, string>();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <TypographyH1>
            <FormattedMessage {...messages.title} />
          </TypographyH1>
          <TypographyP tone="subtle">
            <FormattedMessage {...messages.description} />
          </TypographyP>
        </div>
        <Button
          type="button"
          nativeButton={false}
          variant="outline"
          size="sm"
          render={<Link href={buildOrganizationPath(organizationSlug, "knowledge")} />}
        >
          <FormattedMessage {...messages.backToGuideline} />
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <TypographyP weight="medium">
          <FormattedMessage {...messages.documents} />
        </TypographyP>
        {orgWide.length === 0 ? (
          <TypographyP tone="subtle">
            <FormattedMessage {...messages.noDocuments} />
          </TypographyP>
        ) : (
          orgWide.map((doc) => {
            const projectIds = byDocument.get(doc.id) ?? [];
            return (
              <AssignmentRow
                key={doc.id}
                organizationSlug={organizationSlug}
                title={doc.title}
                assigned={projectIds.map((projectId) => ({
                  projectId,
                  projectName: projectNames.get(projectId) ?? projectId,
                }))}
                canUpdate={canUpdate}
                onAttach={(pid) => attachDocument.mutate({ documentId: doc.id, projectId: pid })}
                onDetach={(pid) => detachDocument.mutate({ documentId: doc.id, projectId: pid })}
                attachPending={attachDocument.isPending}
              />
            );
          })
        )}
      </section>
    </div>
  );
}
