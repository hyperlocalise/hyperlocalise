import Link from "next/link";
import { Add01Icon, Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { ProjectListRow } from "./project-list";
import { TypographyH3, TypographyP } from "@/components/ui/typography";

export function ProjectsTable({
  projects,
  projectsQuery,
  isSavingProject,
  isDeletingProject,
  organizationSlug,
  onCreateProject,
  onEditProject,
  onDeleteProject,
}: {
  projects: ProjectListRow[];
  projectsQuery: UseQueryResult<ProjectListRow[], Error>;
  isSavingProject: boolean;
  isDeletingProject: boolean;
  organizationSlug: string;
  onCreateProject: () => void;
  onEditProject: (project: ProjectListRow) => void;
  onDeleteProject: (project: ProjectListRow) => void;
}) {
  return (
    <section>
      {projectsQuery.isLoading ? (
        <div className="border-t border-foreground/8 px-1 py-8 text-sm text-foreground/52">
          Loading projects...
        </div>
      ) : null}
      {projectsQuery.isError ? (
        <div className="border-t border-foreground/8 px-1 py-8">
          <TypographyP className="text-sm font-medium text-flame-100">
            Projects failed to load.
          </TypographyP>
          <TypographyP className="mt-1 text-xs text-foreground/42">
            {projectsQuery.error instanceof Error
              ? projectsQuery.error.message
              : "Refresh the page to try again."}
          </TypographyP>
        </div>
      ) : null}
      {projectsQuery.isSuccess && projects.length === 0 ? (
        <div className="flex min-h-56 flex-col justify-between gap-8 border-t border-foreground/8 px-1 py-8 sm:flex-row sm:items-end sm:py-10">
          <div className="max-w-xl">
            <TypographyP className="text-sm font-medium text-foreground">
              Create your first localization project
            </TypographyP>
            <TypographyP className="mt-2 text-sm leading-6 text-foreground/52">
              Track source content, release ownership, and translation context before work moves
              into translation jobs.
            </TypographyP>
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
              className="group min-w-0 rounded-lg border border-foreground/8 bg-foreground/2.5 p-4 transition-colors hover:border-foreground/14 hover:bg-foreground/4"
            >
              <div className="flex items-start justify-between gap-4">
                <Link
                  href={`/org/${organizationSlug}/projects/${project.id}/files`}
                  className="min-w-0 flex-1"
                >
                  <TypographyH3 className="min-w-0 truncate text-base font-medium text-foreground md:text-base group-hover:text-foreground/80">
                    {project.name}
                  </TypographyH3>
                  <TypographyP className="mt-1 truncate text-xs text-foreground/36">
                    {project.id}
                  </TypographyP>
                </Link>

                <div className="flex shrink-0 items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => {
                            onEditProject(project);
                          }}
                          disabled={isSavingProject}
                          className="text-foreground/54 hover:text-foreground"
                        />
                      }
                    >
                      <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />
                      <span className="sr-only">Edit {project.name}</span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="center">
                      Edit project
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => {
                            onDeleteProject(project);
                          }}
                          disabled={isDeletingProject || isSavingProject}
                          className="text-foreground/54 hover:text-foreground"
                        />
                      }
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                      <span className="sr-only">Delete {project.name}</span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="center">
                      Delete project
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <Link href={`/org/${organizationSlug}/projects/${project.id}/files`}>
                <dl className="mt-8 grid gap-3 border-t border-foreground/8 pt-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                      Created
                    </dt>
                    <dd className="mt-1 truncate text-sm text-foreground/54">{project.created}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                      Updated
                    </dt>
                    <dd className="mt-1 truncate text-sm text-foreground/54">{project.updated}</dd>
                  </div>
                </dl>
              </Link>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
