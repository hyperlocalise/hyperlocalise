"use client";

import Link from "next/link";
import { Folder01Icon, FolderKanbanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";

import { PageHeader } from "../../_components/workspace-resource-shared";
import { TypographyH3, TypographyP } from "@/components/ui/typography";

export function FilesPageContent({ organizationSlug }: { organizationSlug: string }) {
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

  const projects = projectsQuery.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={Folder01Icon}
        label="Workspace"
        title="Files"
        description="Browse repository source files by project. Select a project to view its file tree and translation jobs."
      />

      {projectsQuery.isLoading ? (
        <TypographyP className="text-sm text-foreground/52">Loading projects…</TypographyP>
      ) : projectsQuery.isError ? (
        <TypographyP className="text-sm text-flame-100">Failed to load projects.</TypographyP>
      ) : projects.length === 0 ? (
        <div className="flex min-h-56 flex-col justify-between gap-8 rounded-lg border border-foreground/8 bg-foreground/2.5 p-8">
          <div className="max-w-xl">
            <TypographyP className="text-sm font-medium text-foreground">
              Create your first localization project
            </TypographyP>
            <TypographyP className="mt-2 text-sm leading-6 text-foreground/52">
              Projects are where repository source files live. Create a project to start browsing
              and translating files.
            </TypographyP>
            <Link
              href={`/org/${organizationSlug}/integrations`}
              className="mt-3 inline-flex items-center gap-2 text-sm text-foreground/54 hover:text-foreground"
            >
              <span>Or connect a TMS provider to import existing files</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/org/${organizationSlug}/projects/${project.id}/files`}
              className="min-w-0 rounded-lg border border-foreground/8 bg-foreground/2.5 p-4 transition-colors hover:border-foreground/14 hover:bg-foreground/4"
            >
              <div className="flex items-start gap-3">
                <HugeiconsIcon
                  icon={FolderKanbanIcon}
                  strokeWidth={1.8}
                  className="mt-0.5 size-5 shrink-0 text-foreground/42"
                />
                <div className="min-w-0">
                  <TypographyH3 className="min-w-0 truncate text-base font-medium text-foreground">
                    {project.name}
                  </TypographyH3>
                  <TypographyP className="mt-1 truncate text-xs text-foreground/36">
                    {project.id}
                  </TypographyP>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
