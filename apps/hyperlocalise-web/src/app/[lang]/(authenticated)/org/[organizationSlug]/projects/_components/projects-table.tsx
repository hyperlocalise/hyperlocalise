import Link from "next/link";
import {
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Delete02Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH3, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/credentials/tms-user-connection-shared";

import { formatRelativeTimestamp } from "../../_components/workspace-files-shared";
import { ProjectAvatar } from "./project-avatar";
import { formatProjectLocaleRoute, type ProjectListRow } from "./project-list";

function NativeEmptyState({
  compact,
  onCreateProject,
}: {
  compact: boolean;
  onCreateProject?: () => void;
}) {
  if (compact) {
    return (
      <TypographyP className="text-sm leading-6 text-muted-foreground">
        No Hyperlocalise projects yet.{" "}
        {onCreateProject ? (
          <button
            type="button"
            onClick={onCreateProject}
            className="text-subtle-foreground underline hover:text-foreground"
          >
            Create one
          </button>
        ) : (
          "Create one"
        )}{" "}
        to add translation context and job tracking.
      </TypographyP>
    );
  }

  return (
    <div className="max-w-xl space-y-3 py-6">
      <TypographyP className="text-sm font-medium text-foreground">
        Create your first localization project
      </TypographyP>
      <TypographyP className="text-sm leading-6 text-muted-foreground">
        Track source content, release ownership, and translation context before work moves into
        translation jobs.
      </TypographyP>
    </div>
  );
}

function TmsProjectRow({
  project,
  organizationSlug,
  onOpenProject,
}: {
  project: ProjectListRow;
  organizationSlug: string;
  onOpenProject?: (projectId: string) => void;
}) {
  const providerName = getTmsProviderBranding(project.externalProviderKind).name;
  const localeRoute = formatProjectLocaleRoute(project.sourceLocale, project.targetLocales);
  const activityLabel = project.lastActivityAt
    ? formatRelativeTimestamp(project.lastActivityAt)
    : null;
  const metaParts = [
    providerName,
    localeRoute,
    activityLabel ? `Active ${activityLabel}` : null,
  ].filter(Boolean);

  return (
    <article className="group min-w-0">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted px-3 py-3 transition-colors hover:border-beam-500/30 hover:bg-beam-500/5">
        <ProjectAvatar project={project} compact />
        <Link
          href={`/org/${organizationSlug}/projects/${project.id}`}
          onClick={() => onOpenProject?.(project.id)}
          className="min-w-0 flex-1"
        >
          <div className="flex min-w-0 items-center gap-2">
            <TypographyH3 className="min-w-0 truncate text-sm font-medium text-foreground">
              {project.name}
            </TypographyH3>
            {!project.isActive ? (
              <Badge variant="outline" className="text-[10px]">
                Inactive
              </Badge>
            ) : null}
          </div>
          <TypographyP className="mt-1 truncate text-xs text-muted-foreground">
            {metaParts.join(" · ")}
          </TypographyP>
          {project.descriptionValue ? (
            <TypographyP className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {project.descriptionValue}
            </TypographyP>
          ) : null}
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          {project.externalProjectUrl ? (
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
                    <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={1.8} />
                    <span className="sr-only">Open {project.name} in provider</span>
                  </Button>
                }
              />
              <TooltipContent side="bottom" align="center">
                Open in {providerName}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={1.8}
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </div>
      </div>
    </article>
  );
}

function NativeProjectCard({
  project,
  organizationSlug,
  isSavingProject,
  isDeletingProject,
  onEditProject,
  onDeleteProject,
  onOpenProject,
}: {
  project: ProjectListRow;
  organizationSlug: string;
  isSavingProject: boolean;
  isDeletingProject: boolean;
  onEditProject: (project: ProjectListRow) => void;
  onDeleteProject: (project: ProjectListRow) => void;
  onOpenProject?: (projectId: string) => void;
}) {
  return (
    <article className="group min-w-0 rounded-lg border border-border bg-muted p-4 transition-colors hover:border-beam-500/30 hover:bg-beam-500/5">
      <div className="flex items-start justify-between gap-4">
        <Link
          href={`/org/${organizationSlug}/projects/${project.id}`}
          onClick={() => onOpenProject?.(project.id)}
          className="min-w-0 flex flex-1 items-start gap-3"
        >
          <ProjectAvatar project={project} />
          <div className="min-w-0 flex-1">
            <TypographyH3 className="min-w-0 truncate text-base font-medium text-foreground">
              {project.name}
            </TypographyH3>
            <TypographyP className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {project.descriptionValue || "No description yet"}
            </TypographyP>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onEditProject(project)}
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
                  onClick={() => onDeleteProject(project)}
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
        </div>
      </div>

      <dl className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
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
        <div className="min-w-0">
          <dt className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Updated
          </dt>
          <dd className="mt-1 truncate text-sm text-muted-foreground">
            {project.lastActivityAt
              ? formatRelativeTimestamp(project.lastActivityAt)
              : project.updated}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function ProjectsTable({
  projects,
  projectsQuery,
  isSavingProject,
  isDeletingProject,
  organizationSlug,
  variant,
  compactEmptyNative = false,
  onEditProject,
  onDeleteProject,
  onCreateProject,
  onOpenProject,
}: {
  projects: ProjectListRow[];
  projectsQuery: UseQueryResult<ProjectListRow[], Error>;
  isSavingProject: boolean;
  isDeletingProject: boolean;
  organizationSlug: string;
  variant: "native" | "tms";
  compactEmptyNative?: boolean;
  onEditProject?: (project: ProjectListRow) => void;
  onDeleteProject?: (project: ProjectListRow) => void;
  onCreateProject?: () => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const emptyTmsTitle = "No TMS projects found";
  const emptyTmsDescription =
    "Your provider connection is active, but no projects were returned from the live API.";

  return (
    <section>
      {projectsQuery.isLoading ? (
        <div className={cn("text-sm text-muted-foreground", variant === "tms" ? "py-4" : "py-8")}>
          Loading projects...
        </div>
      ) : null}
      {projectsQuery.isError ? (
        <div className={cn(variant === "tms" ? "py-4" : "py-8")}>
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
        variant === "native" ? (
          <NativeEmptyState compact={compactEmptyNative} onCreateProject={onCreateProject} />
        ) : (
          <div className="max-w-xl space-y-3 py-4">
            <TypographyP className="text-sm font-medium text-foreground">
              {emptyTmsTitle}
            </TypographyP>
            <TypographyP className="text-sm leading-6 text-muted-foreground">
              {emptyTmsDescription}
            </TypographyP>
          </div>
        )
      ) : null}
      {projectsQuery.isSuccess && projects.length > 0 && variant === "tms" ? (
        <div className="grid gap-2">
          {projects.map((project) => (
            <TmsProjectRow
              key={project.id}
              project={project}
              organizationSlug={organizationSlug}
              onOpenProject={onOpenProject}
            />
          ))}
        </div>
      ) : null}
      {projectsQuery.isSuccess &&
      projects.length > 0 &&
      variant === "native" &&
      onEditProject &&
      onDeleteProject ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {projects.map((project) => (
            <NativeProjectCard
              key={project.id}
              project={project}
              organizationSlug={organizationSlug}
              isSavingProject={isSavingProject}
              isDeletingProject={isDeletingProject}
              onEditProject={onEditProject}
              onDeleteProject={onDeleteProject}
              onOpenProject={onOpenProject}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
