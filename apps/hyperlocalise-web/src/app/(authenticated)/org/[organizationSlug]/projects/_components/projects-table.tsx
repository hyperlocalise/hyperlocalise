import { Archive01Icon, Edit02Icon, FolderKanbanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { ResourceCard } from "../../_components/workspace-resource-shared";
import type { ProjectListRow } from "./project-list";

const projectTableColumns =
  "grid-cols-[minmax(12rem,0.9fr)_5rem_minmax(14rem,1.1fr)_minmax(14rem,1.1fr)_10rem_10rem_7rem]";

export function ProjectsTable({
  projects,
  projectsQuery,
  isSavingProject,
  isArchivingProject,
  onEditProject,
  onArchiveProject,
}: {
  projects: ProjectListRow[];
  projectsQuery: UseQueryResult<ProjectListRow[], Error>;
  isSavingProject: boolean;
  isArchivingProject: boolean;
  onEditProject: (project: ProjectListRow) => void;
  onArchiveProject: (project: ProjectListRow) => void;
}) {
  return (
    <ResourceCard
      title="Active projects"
      description="Live project records from the database with their stored description, translation context, and timestamps."
      icon={FolderKanbanIcon}
    >
      <div className="overflow-x-auto">
        <div className="min-w-240">
          <div
            className={`grid ${projectTableColumns} gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-white/38 uppercase`}
          >
            <p>Project</p>
            <p>Key</p>
            <p>Description</p>
            <p>Translation context</p>
            <p>Created</p>
            <p>Updated</p>
            <p>Actions</p>
          </div>
          <Separator className="bg-white/8" />
          {projectsQuery.isLoading ? (
            <div className="px-5 py-8 text-sm text-white/52">Loading projects...</div>
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
                  <div className={`grid ${projectTableColumns} items-center gap-3 px-5 py-4`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{project.name}</p>
                      <p className="mt-0.5 truncate text-xs text-white/42">{project.id}</p>
                    </div>
                    <p className="text-sm text-white/48">{project.key}</p>
                    <p className="truncate text-sm text-white/58">{project.description}</p>
                    <p className="truncate text-sm text-white/58">{project.translationContext}</p>
                    <p className="text-sm text-white/42">{project.created}</p>
                    <p className="text-sm text-white/42">{project.updated}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Edit ${project.name}`}
                        onClick={() => {
                          onEditProject(project);
                        }}
                        disabled={isSavingProject}
                      >
                        <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Archive ${project.name}`}
                        onClick={() => {
                          onArchiveProject(project);
                        }}
                        disabled={isArchivingProject || isSavingProject}
                      >
                        <HugeiconsIcon icon={Archive01Icon} strokeWidth={1.8} />
                      </Button>
                    </div>
                  </div>
                  {index < projects.length - 1 ? <Separator className="bg-white/8" /> : null}
                </div>
              ))
            : null}
        </div>
      </div>
    </ResourceCard>
  );
}
