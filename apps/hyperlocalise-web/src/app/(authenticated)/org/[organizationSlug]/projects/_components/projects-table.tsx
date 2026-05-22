import Link from "next/link";
import {
  Add01Icon,
  Delete02Icon,
  Edit02Icon,
  ArrowRight01Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  TranslationIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { ProjectListRow } from "./project-list";
import { TypographyH3, TypographyP } from "@/components/ui/typography";

function ProviderBadge({
  externalProviderKind,
}: {
  externalProviderKind: ProjectListRow["externalProviderKind"];
}) {
  if (!externalProviderKind) return null;

  const labels: Record<string, string> = {
    crowdin: "Crowdin",
    smartling: "Smartling",
    phrase: "Phrase",
    lokalise: "Lokalise",
  };

  return (
    <Badge variant="secondary" className="text-[10px]">
      {labels[externalProviderKind] ?? externalProviderKind}
    </Badge>
  );
}

function HealthBadge({ project }: { project: ProjectListRow }) {
  if (project.source === "native") return null;

  if (!project.isActive) {
    return (
      <Badge variant="outline" className="text-[10px]">
        Inactive
      </Badge>
    );
  }

  if (project.lastSyncErrorAt) {
    return (
      <Badge variant="destructive" className="text-[10px]">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.8} className="size-3" />
        Sync error
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[10px]">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.8} className="size-3" />
      Active
    </Badge>
  );
}

function LocaleSummary({ project }: { project: ProjectListRow }) {
  if (project.source === "native") return null;

  const parts: string[] = [];
  if (project.sourceLocale) {
    parts.push(project.sourceLocale);
  }
  if (project.targetLocales.length > 0) {
    parts.push(`${project.targetLocales.length} target`);
  }

  if (parts.length === 0) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-foreground/52">
      <HugeiconsIcon icon={TranslationIcon} strokeWidth={1.8} className="size-3.5" />
      <span>{parts.join(" → ")}</span>
    </div>
  );
}

function SyncInfo({ project }: { project: ProjectListRow }) {
  if (project.source === "native") return null;

  if (project.lastSyncErrorAt) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="text-xs text-destructive">
              Last sync failed {project.lastSyncErrorAt}
            </span>
          }
        />
        <TooltipContent side="bottom" align="start" className="max-w-xs">
          <p className="text-xs">{project.lastSyncErrorMessage ?? "Unknown error"}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (project.lastSyncedAt) {
    return <span className="text-xs text-foreground/42">Synced {project.lastSyncedAt}</span>;
  }

  return <span className="text-xs text-foreground/42">Not synced yet</span>;
}

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
            <Link
              href={`/org/${organizationSlug}/integrations`}
              className="mt-3 inline-flex items-center gap-2 text-sm text-foreground/54 hover:text-foreground"
            >
              <span>Or connect a TMS provider to import existing projects</span>
            </Link>
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
                  <div className="flex items-center gap-2">
                    <TypographyH3 className="min-w-0 truncate text-base font-medium text-foreground md:text-base group-hover:text-foreground/80">
                      {project.name}
                    </TypographyH3>
                    <ProviderBadge externalProviderKind={project.externalProviderKind} />
                    <HealthBadge project={project} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <TypographyP className="truncate text-xs text-foreground/36">
                      {project.id}
                    </TypographyP>
                    <LocaleSummary project={project} />
                  </div>
                </Link>

                <div className="flex shrink-0 items-center gap-1">
                  {project.source === "native" ? (
                    <>
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
                    </>
                  ) : project.externalProjectUrl ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            render={
                              <a
                                href={project.externalProjectUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              />
                            }
                            className="text-foreground/54 hover:text-foreground"
                          >
                            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} />
                            <span className="sr-only">Open {project.name} in provider</span>
                          </Button>
                        }
                      />
                      <TooltipContent side="bottom" align="center">
                        Open in provider
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              </div>

              <dl className="mt-6 grid gap-3 border-t border-foreground/8 pt-4 sm:grid-cols-2">
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
                {project.source === "external_tms" ? (
                  <div className="min-w-0">
                    <dt className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                      Last sync
                    </dt>
                    <dd className="mt-1 truncate text-sm text-foreground/54">
                      <SyncInfo project={project} />
                    </dd>
                  </div>
                ) : null}
                <div className="min-w-0">
                  <dt className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                    Open jobs
                  </dt>
                  <dd className="mt-1 truncate text-sm text-foreground/54">
                    {project.openJobCount > 0 ? (
                      <Link
                        href={`/org/${organizationSlug}/projects/${project.id}/jobs`}
                        className="text-foreground/72 hover:text-foreground hover:underline"
                      >
                        {project.openJobCount} {project.openJobCount === 1 ? "job" : "jobs"}
                      </Link>
                    ) : (
                      <span>None</span>
                    )}
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
