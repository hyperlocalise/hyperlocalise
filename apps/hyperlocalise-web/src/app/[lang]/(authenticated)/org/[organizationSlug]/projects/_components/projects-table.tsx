import Link from "next/link";
import {
  Delete02Icon,
  Edit02Icon,
  ArrowRight01Icon,
  TranslationIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/tms-user-connection-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { ProjectListRow } from "./project-list";
import { recordRecentProjectVisit } from "./recent-projects";
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
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <HugeiconsIcon icon={TranslationIcon} strokeWidth={1.8} className="size-3.5" />
      <span>{parts.join(" → ")}</span>
    </div>
  );
}

export function ProjectsTable({
  projects,
  projectsQuery,
  isSavingProject,
  isDeletingProject,
  organizationSlug,
  variant,
  onEditProject,
  onDeleteProject,
}: {
  projects: ProjectListRow[];
  projectsQuery: UseQueryResult<ProjectListRow[], Error>;
  isSavingProject: boolean;
  isDeletingProject: boolean;
  organizationSlug: string;
  variant: "native" | "tms";
  onEditProject?: (project: ProjectListRow) => void;
  onDeleteProject?: (project: ProjectListRow) => void;
}) {
  const emptyNativeTitle = "Create your first localization project";
  const emptyNativeDescription =
    "Track source content, release ownership, and translation context before work moves into translation jobs.";
  const emptyTmsTitle = "No TMS projects found";
  const emptyTmsDescription =
    "Your provider connection is active, but no projects were returned from the live API.";

  return (
    <section>
      {projectsQuery.isLoading ? (
        <div className="border-t border-border px-1 py-8 text-sm text-muted-foreground">
          Loading projects...
        </div>
      ) : null}
      {projectsQuery.isError ? (
        <div className="border-t border-border px-1 py-8">
          {variant === "tms" && isTmsUserConnectionRequiredError(projectsQuery.error) ? (
            <TmsUserConnectionErrorPanel
              organizationSlug={organizationSlug}
              resource="projects"
              error={projectsQuery.error}
            />
          ) : (
            <>
              <TypographyP className="text-sm font-medium text-flame-100">
                Projects failed to load.
              </TypographyP>
              <TypographyP className="mt-1 text-xs text-muted-foreground">
                {projectsQuery.error instanceof Error
                  ? projectsQuery.error.message
                  : "Refresh the page to try again."}
              </TypographyP>
            </>
          )}
        </div>
      ) : null}
      {projectsQuery.isSuccess && projects.length === 0 ? (
        <div className="max-w-xl space-y-3 py-6">
          <TypographyP className="text-sm font-medium text-foreground">
            {variant === "native" ? emptyNativeTitle : emptyTmsTitle}
          </TypographyP>
          <TypographyP className="text-sm leading-6 text-muted-foreground">
            {variant === "native" ? emptyNativeDescription : emptyTmsDescription}
          </TypographyP>
        </div>
      ) : null}
      {projectsQuery.isSuccess && projects.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {projects.map((project) => (
            <article
              key={project.id}
              className="group min-w-0 rounded-lg border border-border bg-muted p-4 transition-colors hover:border-border hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-4">
                <Link
                  href={`/org/${organizationSlug}/projects/${project.id}`}
                  className="min-w-0 flex-1"
                  onClick={() => {
                    recordRecentProjectVisit(organizationSlug, project.id);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <TypographyH3 className="min-w-0 truncate text-base font-medium text-foreground md:text-base group-hover:text-foreground">
                      {project.name}
                    </TypographyH3>
                    <ProviderBadge externalProviderKind={project.externalProviderKind} />
                    {variant === "tms" && !project.isActive ? (
                      <Badge variant="outline" className="text-[10px]">
                        Inactive
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <TypographyP className="truncate text-xs text-muted-foreground">
                      {project.id}
                    </TypographyP>
                    <LocaleSummary project={project} />
                  </div>
                </Link>

                <div className="flex shrink-0 items-center gap-1">
                  {variant === "native" && onEditProject && onDeleteProject ? (
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
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />
                              <span className="sr-only">Edit {project.name}</span>
                            </Button>
                          }
                        />
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
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                              <span className="sr-only">Delete {project.name}</span>
                            </Button>
                          }
                        />
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
                            className="text-muted-foreground hover:text-foreground"
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

              {variant === "native" ? (
                <dl className="mt-6 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                      Open jobs
                    </dt>
                    <dd className="mt-1 truncate text-sm text-muted-foreground">
                      {project.openJobCount > 0 ? (
                        <Link
                          href={`/org/${organizationSlug}/projects/${project.id}/jobs`}
                          className="text-subtle-foreground hover:text-foreground hover:underline"
                        >
                          {project.openJobCount} {project.openJobCount === 1 ? "job" : "jobs"}
                        </Link>
                      ) : (
                        <span>None</span>
                      )}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
