"use client";

import { FolderKanbanIcon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";

import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api-client-instance";

import { MetricsGrid, PageHeader, ResourceCard } from "../../_components/workspace-resource-shared";
import { mapProjectToPortfolioRow } from "./projects-portfolio";

export function ProjectsPageContent({ organizationSlug }: { organizationSlug: string }) {
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
      return body.projects.map(mapProjectToPortfolioRow);
    },
  });

  const projects = projectsQuery.data ?? [];
  const projectStatusLabel = projectsQuery.isLoading
    ? "Loading"
    : projectsQuery.isError
      ? "Unavailable"
      : `${projects.length} live`;
  const projectMetrics = [
    {
      label: "Projects",
      value: String(projects.length),
      detail: projectsQuery.isLoading ? "loading from database" : "database records",
      tone: "info",
    },
    {
      label: "With description",
      value: String(projects.filter((project) => project.description !== "No description").length),
      detail: "project description set",
      tone: "safe",
    },
    {
      label: "With context",
      value: String(
        projects.filter((project) => project.translationContext !== "No translation context")
          .length,
      ),
      detail: "translation context set",
      tone: "info",
    },
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={FolderKanbanIcon}
        label="Workspace projects"
        title="Projects"
        description="Track localization programs by release, source, owner, and market readiness before they move into translation jobs."
        statusLabel={projectStatusLabel}
      />
      <MetricsGrid metrics={projectMetrics} />
      <section>
        <ResourceCard
          title="Project portfolio"
          description="Live project records from the database with their stored description, translation context, and timestamps."
          icon={FolderKanbanIcon}
        >
          <div className="overflow-x-auto">
            <div className="min-w-240">
              <div className="grid grid-cols-[minmax(12rem,0.9fr)_5rem_minmax(14rem,1.1fr)_minmax(14rem,1.1fr)_10rem_10rem] gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-white/38 uppercase">
                <p>Project</p>
                <p>Key</p>
                <p>Description</p>
                <p>Translation context</p>
                <p>Created</p>
                <p>Updated</p>
              </div>
              <Separator className="bg-white/8" />
              {projectsQuery.isLoading ? (
                <div className="px-5 py-8 text-sm text-white/52">Loading projects…</div>
              ) : null}
              {projectsQuery.isError ? (
                <div className="px-5 py-8">
                  <p className="text-sm font-medium text-flame-100">Projects failed to load.</p>
                  <p className="mt-1 text-xs text-white/42">
                    {projectsQuery.error instanceof Error
                      ? projectsQuery.error.message
                      : "Refresh the page to try again."}
                  </p>
                </div>
              ) : null}
              {projectsQuery.isSuccess && projects.length === 0 ? (
                <div className="px-5 py-8">
                  <p className="text-sm font-medium text-white">No projects yet.</p>
                  <p className="mt-1 text-xs text-white/42">
                    Create a project to start tracking localization work here.
                  </p>
                </div>
              ) : null}
              {projectsQuery.isSuccess
                ? projects.map((project, index) => (
                    <div key={project.id}>
                      <div className="grid grid-cols-[minmax(12rem,0.9fr)_5rem_minmax(14rem,1.1fr)_minmax(14rem,1.1fr)_10rem_10rem] items-center gap-3 px-5 py-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{project.name}</p>
                          <p className="mt-0.5 truncate text-xs text-white/42">{project.id}</p>
                        </div>
                        <p className="text-sm text-white/48">{project.key}</p>
                        <p className="truncate text-sm text-white/58">{project.description}</p>
                        <p className="truncate text-sm text-white/58">
                          {project.translationContext}
                        </p>
                        <p className="text-sm text-white/42">{project.created}</p>
                        <p className="text-sm text-white/42">{project.updated}</p>
                      </div>
                      {index < projects.length - 1 ? <Separator className="bg-white/8" /> : null}
                    </div>
                  ))
                : null}
            </div>
          </div>
        </ResourceCard>
      </section>
    </div>
  );
}
