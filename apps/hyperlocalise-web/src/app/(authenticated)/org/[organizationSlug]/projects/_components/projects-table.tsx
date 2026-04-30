import { Add01Icon, Archive01Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";

import type { ProjectListRow } from "./project-list";

export function ProjectsTable({
  projects,
  projectsQuery,
  isSavingProject,
  isArchivingProject,
  onCreateProject,
  onEditProject,
  onArchiveProject,
}: {
  projects: ProjectListRow[];
  projectsQuery: UseQueryResult<ProjectListRow[], Error>;
  isSavingProject: boolean;
  isArchivingProject: boolean;
  onCreateProject: () => void;
  onEditProject: (project: ProjectListRow) => void;
  onArchiveProject: (project: ProjectListRow) => void;
}) {
  return (
    <section>
      {projectsQuery.isLoading ? (
        <div className="border-t border-app-shell-foreground/8 px-1 py-8 text-sm text-app-shell-foreground/52">
          Loading projects...
        </div>
      ) : null}
      {projectsQuery.isError ? (
        <div className="border-t border-app-shell-foreground/8 px-1 py-8">
          <p className="text-sm font-medium text-flame-100">Projects failed to load.</p>
          <p className="mt-1 text-xs text-app-shell-foreground/42">
            {projectsQuery.error instanceof Error
              ? projectsQuery.error.message
              : "Refresh the page to try again."}
          </p>
        </div>
      ) : null}
      {projectsQuery.isSuccess && projects.length === 0 ? (
        <div className="flex min-h-56 flex-col justify-between gap-8 border-t border-app-shell-foreground/8 px-1 py-8 sm:flex-row sm:items-end sm:py-10">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-app-shell-foreground">
              Create your first localization project
            </p>
            <p className="mt-2 text-sm leading-6 text-app-shell-foreground/52">
              Track source content, release ownership, and translation context before work moves
              into translation jobs.
            </p>
          </div>
          <Button
            type="button"
            onClick={onCreateProject}
            disabled={isSavingProject}
            className="w-full sm:w-fit"
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
            Create project
          </Button>
        </div>
      ) : null}
      {projectsQuery.isSuccess && projects.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {projects.map((project) => (
            <article
              key={project.id}
              className="min-w-0 rounded-lg border border-app-shell-foreground/8 bg-app-shell-foreground/[0.025] p-4 transition-colors hover:border-app-shell-foreground/14 hover:bg-app-shell-foreground/[0.04]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="min-w-0 truncate text-base font-medium text-app-shell-foreground">
                    {project.name}
                  </h3>
                  <p className="mt-1 truncate text-xs text-app-shell-foreground/36">{project.id}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${project.name}`}
                    onClick={() => {
                      onEditProject(project);
                    }}
                    disabled={isSavingProject}
                    className="text-app-shell-foreground/54 hover:text-app-shell-foreground"
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
                    className="text-app-shell-foreground/54 hover:text-app-shell-foreground"
                  >
                    <HugeiconsIcon icon={Archive01Icon} strokeWidth={1.8} />
                  </Button>
                </div>
              </div>

              <dl className="mt-8 grid gap-3 border-t border-app-shell-foreground/8 pt-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs font-medium tracking-[0.08em] text-app-shell-foreground/34 uppercase">
                    Created
                  </dt>
                  <dd className="mt-1 truncate text-sm text-app-shell-foreground/54">
                    {project.created}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium tracking-[0.08em] text-app-shell-foreground/34 uppercase">
                    Updated
                  </dt>
                  <dd className="mt-1 truncate text-sm text-app-shell-foreground/54">
                    {project.updated}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
