"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight01Icon, File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import type {
  WorkspaceFileRecord,
  WorkspaceFilesResponse,
} from "@/api/routes/project/project.schema";
import { apiClient } from "@/lib/api-client-instance";

import {
  collectLocaleOptions,
  defaultWorkspaceFileFilters,
  formatRelativeTimestamp,
  ProviderKindBadge,
  ResourceTypeBadge,
  SourceOriginBadge,
  summarizeLocaleReadiness,
  SyncStateBadge,
  WorkspaceFilesFilterBar,
  toProjectFilesApiQuery,
  type WorkspaceFileFilters,
} from "../../_components/workspace-files-shared";
import { PageHeader } from "../../_components/workspace-resource-shared";
import { TypographyH3, TypographyP } from "@/components/ui/typography";

function fileDetailHref(organizationSlug: string, file: WorkspaceFileRecord) {
  const params = new URLSearchParams({ sourcePath: file.sourcePath });
  return `/org/${organizationSlug}/projects/${file.projectId}/files?${params.toString()}`;
}

export function FilesPageContent({ organizationSlug }: { organizationSlug: string }) {
  const [filters, setFilters] = useState<WorkspaceFileFilters>(defaultWorkspaceFileFilters);

  const projectsQuery = useQuery({
    queryKey: ["translation-projects", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(`Failed to load projects (${response.status})`);
      }

      const body = await response.json();
      return body.projects;
    },
  });

  const filesQuery = useQuery({
    queryKey: ["workspace-files", organizationSlug, filters],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["workspace-files"].$get({
        param: { organizationSlug },
        query: toProjectFilesApiQuery(filters),
      });

      if (!response.ok) {
        throw new Error(`Failed to load files (${response.status})`);
      }

      return (await response.json()) as WorkspaceFilesResponse;
    },
  });

  const files = filesQuery.data?.files ?? [];
  const localeOptions = useMemo(() => collectLocaleOptions(files), [files]);
  const projectOptions = useMemo(
    () =>
      (projectsQuery.data ?? []).map((project) => ({
        id: project.id,
        name: project.name,
      })),
    [projectsQuery.data],
  );

  const groupedByProject = useMemo(() => {
    const groups = new Map<string, { projectName: string; files: WorkspaceFileRecord[] }>();

    for (const file of files) {
      const existing = groups.get(file.projectId);
      if (existing) {
        existing.files.push(file);
      } else {
        groups.set(file.projectId, { projectName: file.projectName, files: [file] });
      }
    }

    return Array.from(groups.entries()).sort(([, a], [, b]) =>
      a.projectName.localeCompare(b.projectName),
    );
  }, [files]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={Folder01Icon}
        label="Workspace"
        title="Files"
        description="Browse repository source files and synced TMS provider files and keys across projects."
      />

      <WorkspaceFilesFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        localeOptions={localeOptions}
        projectOptions={projectOptions}
      />

      {filesQuery.isLoading || projectsQuery.isLoading ? (
        <TypographyP className="text-sm text-foreground/52">Loading files…</TypographyP>
      ) : filesQuery.isError ? (
        <TypographyP className="text-sm text-flame-100">Failed to load files.</TypographyP>
      ) : files.length === 0 ? (
        <div className="flex min-h-56 flex-col justify-between gap-8 rounded-lg border border-foreground/8 bg-foreground/2.5 p-8">
          <div className="max-w-xl">
            <TypographyP className="text-sm font-medium text-foreground">
              No files match these filters
            </TypographyP>
            <TypographyP className="mt-2 text-sm leading-6 text-foreground/52">
              Sync files from a connected TMS provider or upload repository source files in a
              project to see them here.
            </TypographyP>
            <Link
              href={`/org/${organizationSlug}/integrations`}
              className="mt-3 inline-flex items-center gap-2 text-sm text-foreground/54 hover:text-foreground"
            >
              <span>Connect a TMS provider</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupedByProject.map(([projectId, group]) => (
            <section
              key={projectId}
              className="rounded-lg border border-foreground/8 bg-foreground/2.5"
            >
              <div className="flex items-center justify-between gap-3 border-b border-foreground/8 px-4 py-3">
                <TypographyH3 className="text-base font-medium text-foreground">
                  {group.projectName}
                </TypographyH3>
                <TypographyP className="text-xs text-foreground/42">
                  {group.files.length} {group.files.length === 1 ? "file" : "files"}
                </TypographyP>
              </div>

              <ul className="divide-y divide-foreground/8">
                {group.files.map((file) => {
                  const readiness = file.provider
                    ? summarizeLocaleReadiness(file.provider.localeReadiness)
                    : null;

                  return (
                    <li key={`${file.projectId}:${file.sourcePath}`}>
                      <Link
                        href={fileDetailHref(organizationSlug, file)}
                        className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-foreground/4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <HugeiconsIcon
                            icon={File01Icon}
                            strokeWidth={1.8}
                            className="mt-0.5 size-4 shrink-0 text-foreground/42"
                          />
                          <div className="min-w-0">
                            <TypographyP className="truncate text-sm font-medium text-foreground">
                              {file.filename}
                            </TypographyP>
                            <TypographyP className="mt-0.5 truncate font-mono text-xs text-foreground/42">
                              {file.sourcePath}
                            </TypographyP>
                            {readiness ? (
                              <TypographyP className="mt-1 text-xs text-foreground/42">
                                Locales: {readiness}
                              </TypographyP>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <SourceOriginBadge origin={file.origin} />
                          {file.provider ? (
                            <>
                              <ProviderKindBadge kind={file.provider.kind} />
                              <ResourceTypeBadge resourceType={file.provider.resourceType} />
                              <SyncStateBadge syncState={file.provider.syncState} />
                              <TypographyP className="text-xs text-foreground/42">
                                Synced {formatRelativeTimestamp(file.provider.lastSyncedAt)}
                              </TypographyP>
                            </>
                          ) : (
                            <TypographyP className="text-xs text-foreground/42">
                              Updated {formatRelativeTimestamp(file.uploadedAt)}
                            </TypographyP>
                          )}
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            strokeWidth={1.8}
                            className="size-4 text-foreground/34"
                          />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
