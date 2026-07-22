"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Link from "next/link";
import {
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Delete02Icon,
  Edit02Icon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH3, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/credentials/tms-user-connection-shared";

import { formatRelativeTimestamp } from "../../_components/workspace-files-shared";
import { ProjectAvatar } from "./project-avatar";
import { formatProjectLocaleRoute, type ProjectListRow } from "./project-list";
import { projectsTableMessages } from "./projects-table.messages";

export const PROJECTS_PAGE_SIZE = 12;

function ProjectCardSkeleton() {
  return (
    <article className="rounded-lg border border-border bg-muted p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-3 w-full max-w-sm" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </dl>
    </article>
  );
}

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
        <FormattedMessage
          {...projectsTableMessages.nativeEmptyCompact}
          values={{
            action: (chunks) =>
              onCreateProject ? (
                <button
                  type="button"
                  onClick={onCreateProject}
                  className="text-subtle-foreground underline hover:text-foreground"
                >
                  {chunks}
                </button>
              ) : (
                chunks
              ),
          }}
        />
      </TypographyP>
    );
  }

  return (
    <div className="max-w-xl space-y-3 py-6">
      <TypographyP className="text-sm font-medium text-foreground">
        <FormattedMessage {...projectsTableMessages.nativeEmptyTitle} />
      </TypographyP>
      <TypographyP className="text-sm leading-6 text-muted-foreground">
        <FormattedMessage {...projectsTableMessages.nativeEmptyDescription} />
      </TypographyP>
    </div>
  );
}

function ProjectCard({
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
  onEditProject?: (project: ProjectListRow) => void;
  onDeleteProject?: (project: ProjectListRow) => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const intl = useIntl();
  const providerName =
    project.source === "external_tms"
      ? getTmsProviderBranding(project.externalProviderKind).name
      : intl.formatMessage(projectsTableMessages.hyperlocaliseProvider);
  const localeRoute = formatProjectLocaleRoute(project.sourceLocale, project.targetLocales);
  const activityLabel = project.lastActivityAt
    ? formatRelativeTimestamp(project.lastActivityAt)
    : project.updated || intl.formatMessage(projectsTableMessages.updatedUnavailable);
  const isNativeProject = project.source === "native";
  const projectHref = `/org/${organizationSlug}/projects/${project.id}`;

  return (
    <article className="group min-w-0 rounded-lg border border-border bg-muted p-4 transition-colors hover:border-beam-500/30 hover:bg-beam-500/5">
      <div className="flex items-start justify-between gap-4">
        <Link
          href={projectHref}
          onClick={() => onOpenProject?.(project.id)}
          className="min-w-0 flex flex-1 items-start gap-3"
        >
          <ProjectAvatar project={project} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <TypographyH3 className="min-w-0 truncate text-base font-medium text-foreground">
                {project.name}
              </TypographyH3>
              {!project.isActive ? (
                <Badge variant="outline" className="text-[10px]">
                  <FormattedMessage {...projectsTableMessages.inactiveBadge} />
                </Badge>
              ) : null}
            </div>
            <TypographyP className="mt-1 truncate text-xs text-muted-foreground">
              {providerName}
            </TypographyP>
            <TypographyP className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {project.descriptionValue ||
                intl.formatMessage(projectsTableMessages.noDescriptionYet)}
            </TypographyP>
          </div>
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
                    <span className="sr-only">
                      {intl.formatMessage(projectsTableMessages.openInProviderSrOnly, {
                        projectName: project.name,
                      })}
                    </span>
                  </Button>
                }
              />
              <TooltipContent side="bottom" align="center">
                {intl.formatMessage(projectsTableMessages.openInProvider, {
                  providerName,
                })}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {isNativeProject && onEditProject && onDeleteProject ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={intl.formatMessage(projectsTableMessages.actionsForProject, {
                      projectName: project.name,
                    })}
                    disabled={isDeletingProject || isSavingProject}
                    className="text-muted-foreground hover:text-foreground"
                  />
                }
              >
                <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={1.8} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<Link href={projectHref} />}>
                    <FormattedMessage {...projectsTableMessages.openProject} />
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onEditProject(project)}
                    disabled={isSavingProject}
                  >
                    <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />
                    <FormattedMessage {...projectsTableMessages.editProject} />
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDeleteProject(project)}
                    disabled={isDeletingProject || isSavingProject}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                    <FormattedMessage {...projectsTableMessages.deleteProject} />
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={1.8}
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </div>
      </div>

      <dl className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground uppercase">
            <FormattedMessage {...projectsTableMessages.localesLabel} />
          </dt>
          <dd className="mt-1 truncate text-sm text-muted-foreground">{localeRoute}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground uppercase">
            <FormattedMessage {...projectsTableMessages.openJobsLabel} />
          </dt>
          <dd className="mt-1 truncate text-sm text-muted-foreground">
            {project.openJobCount > 0 ? (
              <Link
                href={`/org/${organizationSlug}/projects/${project.id}/jobs`}
                className="text-subtle-foreground hover:text-foreground hover:underline"
              >
                {intl.formatMessage(projectsTableMessages.openJobsCount, {
                  count: project.openJobCount,
                })}
              </Link>
            ) : (
              <span>
                <FormattedMessage {...projectsTableMessages.noOpenJobs} />
              </span>
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground uppercase">
            <FormattedMessage {...projectsTableMessages.updatedLabel} />
          </dt>
          <dd className="mt-1 truncate text-sm text-muted-foreground">{activityLabel}</dd>
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
  hasMore = false,
  onLoadMore,
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
  hasMore?: boolean;
  onLoadMore?: () => void;
  onEditProject?: (project: ProjectListRow) => void;
  onDeleteProject?: (project: ProjectListRow) => void;
  onCreateProject?: () => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const intl = useIntl();

  return (
    <section>
      {projectsQuery.isLoading ? (
        <div
          className="grid gap-3 py-4 lg:grid-cols-2"
          aria-busy="true"
          aria-label={intl.formatMessage(projectsTableMessages.loadingProjects)}
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <ProjectCardSkeleton key={index} />
          ))}
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
                <FormattedMessage {...projectsTableMessages.loadFailedTitle} />
              </TypographyP>
              <TypographyP className="mt-1 text-xs text-muted-foreground">
                {projectsQuery.error instanceof Error
                  ? projectsQuery.error.message
                  : intl.formatMessage(projectsTableMessages.loadFailedFallback)}
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
              <FormattedMessage {...projectsTableMessages.emptyTmsTitle} />
            </TypographyP>
            <TypographyP className="text-sm leading-6 text-muted-foreground">
              <FormattedMessage {...projectsTableMessages.emptyTmsDescription} />
            </TypographyP>
          </div>
        )
      ) : null}
      {projectsQuery.isSuccess && projects.length > 0 && variant === "tms" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              organizationSlug={organizationSlug}
              isSavingProject={isSavingProject}
              isDeletingProject={isDeletingProject}
              onDeleteProject={onDeleteProject}
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
            <ProjectCard
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
      {hasMore && projectsQuery.isSuccess && projects.length > 0 && onLoadMore ? (
        <div className={cn("flex justify-center", variant === "tms" ? "pt-4" : "pt-6")}>
          <Button type="button" variant="outline" onClick={onLoadMore} className="rounded-full">
            <FormattedMessage {...projectsTableMessages.loadMore} />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
