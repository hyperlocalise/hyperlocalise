"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  ArrowUpRight01Icon,
  Delete02Icon,
  Edit02Icon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
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
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/credentials/tms-user-connection-shared";

import { formatRelativeTimestamp } from "../../_components/workspace-files-shared";
import { ProjectAvatar } from "./project-avatar";
import { formatProjectLocaleRoute, type ProjectListRow } from "./project-list";
import { projectsTableMessages } from "./projects-table.messages";

export const PROJECTS_PAGE_SIZE = 12;

function NativeEmptyState({
  compact,
  onCreateProject,
}: {
  compact: boolean;
  onCreateProject?: () => void;
}) {
  if (compact) {
    return (
      <TypographyP className="leading-6" size="small" tone="subtle">
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
      <TypographyP size="small" weight="medium" tone="content">
        <FormattedMessage {...projectsTableMessages.nativeEmptyTitle} />
      </TypographyP>
      <TypographyP className="leading-6" size="small" tone="subtle">
        <FormattedMessage {...projectsTableMessages.nativeEmptyDescription} />
      </TypographyP>
    </div>
  );
}

function ProjectRow({
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
    <tr className="group border-b border-border last:border-b-0 hover:bg-muted/50">
      <td className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProjectAvatar project={project} />
          <div className="min-w-0">
            <OrgNavLink
              href={projectHref}
              prefetch
              onClick={() => onOpenProject?.(project.id)}
              className="block truncate text-sm font-medium text-foreground hover:underline"
            >
              {project.name}
            </OrgNavLink>
            <p className="mt-0.5 max-w-xl truncate text-xs text-muted-foreground">
              {project.descriptionValue ||
                intl.formatMessage(projectsTableMessages.noDescriptionYet)}
            </p>
          </div>
          {!project.isActive ? (
            <Badge variant="outline">
              <FormattedMessage {...projectsTableMessages.inactiveBadge} />
            </Badge>
          ) : null}
        </div>
      </td>
      <td className="px-2 py-3">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs",
            isNativeProject
              ? "bg-[#F0F4FF] text-[#4F6BED] dark:bg-blue-100 dark:text-blue-900"
              : "bg-[#E8F4F8] text-muted-foreground dark:bg-muted",
          )}
        >
          {isNativeProject ? intl.formatMessage(projectsTableMessages.nativeSource) : providerName}
        </span>
      </td>
      <td className="px-2 py-3 text-right text-sm tabular-nums" title={localeRoute}>
        {intl.formatNumber(project.targetLocales.length)}
        <span className="sr-only">{localeRoute}</span>
      </td>
      <td className="px-2 py-3 text-right text-sm tabular-nums">
        {project.openJobCount > 0 ? (
          <OrgNavLink
            href={`${projectHref}/jobs`}
            prefetch
            className="font-medium text-primary hover:underline"
            aria-label={intl.formatMessage(projectsTableMessages.openJobsCount, {
              count: project.openJobCount,
            })}
          >
            {intl.formatNumber(project.openJobCount)}
          </OrgNavLink>
        ) : (
          intl.formatNumber(0)
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-right text-sm text-muted-foreground">
        {activityLabel}
      </td>
      <td className="px-2 py-3">
        <div className="flex shrink-0 items-center gap-1">
          {project.externalProjectUrl ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    nativeButton={false}
                    size="icon-xs"
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
                    size="icon-xs"
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
                  <DropdownMenuItem render={<OrgNavLink href={projectHref} prefetch />}>
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
        </div>
      </td>
    </tr>
  );
}

export function ProjectsTableHeader() {
  return (
    <thead className="border-b border-border bg-muted text-xs font-medium text-muted-foreground">
      <tr>
        <th scope="col" className="px-4 py-2.5 text-left font-medium">
          <FormattedMessage {...projectsTableMessages.projectLabel} />
        </th>
        <th scope="col" className="w-24 px-2 py-2.5 text-left font-medium">
          <FormattedMessage {...projectsTableMessages.sourceLabel} />
        </th>
        <th scope="col" className="w-20 px-2 py-2.5 text-right font-medium">
          <FormattedMessage {...projectsTableMessages.localesLabel} />
        </th>
        <th scope="col" className="w-22 px-2 py-2.5 text-right font-medium">
          <FormattedMessage {...projectsTableMessages.openJobsLabel} />
        </th>
        <th scope="col" className="w-28 px-2 py-2.5 text-right font-medium">
          <FormattedMessage {...projectsTableMessages.updatedLabel} />
        </th>
        <th scope="col" className="w-10">
          <span className="sr-only">
            <FormattedMessage {...projectsTableMessages.actionsLabel} />
          </span>
        </th>
      </tr>
    </thead>
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
  groupLabel,
  totalCount = projects.length,
  grouped = false,
  suppressEmpty = false,
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
  groupLabel?: string;
  totalCount?: number;
  grouped?: boolean;
  suppressEmpty?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onEditProject?: (project: ProjectListRow) => void;
  onDeleteProject?: (project: ProjectListRow) => void;
  onCreateProject?: () => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const intl = useIntl();

  const rows = (
    <tbody>
      {groupLabel ? (
        <tr className="border-b border-border bg-muted">
          <th
            colSpan={6}
            scope="rowgroup"
            className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground"
          >
            <span className="tracking-[0.08em] uppercase">{groupLabel}</span>
            {projectsQuery.isSuccess ? (
              <span className="ml-2 font-normal">
                <FormattedMessage
                  {...projectsTableMessages.projectCount}
                  values={{ count: totalCount }}
                />
              </span>
            ) : null}
          </th>
        </tr>
      ) : null}
      {projectsQuery.isLoading
        ? Array.from({ length: 3 }, (_, index) => (
            <tr
              key={index}
              aria-busy="true"
              aria-label={intl.formatMessage(projectsTableMessages.loadingProjects)}
            >
              <td colSpan={6} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="h-8 w-1/3" />
                  <Skeleton className="ml-auto h-4 w-1/4" />
                </div>
              </td>
            </tr>
          ))
        : null}
      {projectsQuery.isError ? (
        <tr>
          <td colSpan={6} className="px-4 py-4">
            {variant === "tms" && isTmsUserConnectionRequiredError(projectsQuery.error) ? (
              <TmsUserConnectionErrorPanel
                organizationSlug={organizationSlug}
                resource="projects"
                error={projectsQuery.error}
              />
            ) : (
              <div role="alert">
                <TypographyP className="text-destructive" size="small" weight="medium">
                  <FormattedMessage {...projectsTableMessages.loadFailedTitle} />
                </TypographyP>
                <TypographyP className="mt-1" size="xsmall" tone="subtle">
                  {projectsQuery.error.message ||
                    intl.formatMessage(projectsTableMessages.loadFailedFallback)}
                </TypographyP>
              </div>
            )}
          </td>
        </tr>
      ) : null}
      {projectsQuery.isSuccess && projects.length === 0 && !suppressEmpty ? (
        <tr>
          <td colSpan={6} className="px-4 py-4">
            {variant === "native" ? (
              <NativeEmptyState compact={compactEmptyNative} onCreateProject={onCreateProject} />
            ) : (
              <div className="space-y-2">
                <TypographyP size="small" weight="medium">
                  <FormattedMessage {...projectsTableMessages.emptyTmsTitle} />
                </TypographyP>
                <TypographyP size="small" tone="subtle">
                  <FormattedMessage {...projectsTableMessages.emptyTmsDescription} />
                </TypographyP>
              </div>
            )}
          </td>
        </tr>
      ) : null}
      {projectsQuery.isSuccess
        ? projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              organizationSlug={organizationSlug}
              isSavingProject={isSavingProject}
              isDeletingProject={isDeletingProject}
              onEditProject={onEditProject}
              onDeleteProject={onDeleteProject}
              onOpenProject={onOpenProject}
            />
          ))
        : null}
      {hasMore && projectsQuery.isSuccess && onLoadMore ? (
        <tr>
          <td colSpan={6} className="px-4 py-3 text-center">
            <Button type="button" variant="outline" size="sm" onClick={onLoadMore}>
              <FormattedMessage {...projectsTableMessages.loadMore} />
            </Button>
          </td>
        </tr>
      ) : null}
    </tbody>
  );
  return grouped ? (
    rows
  ) : (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-180 table-fixed">
        <ProjectsTableHeader />
        {rows}
      </table>
    </div>
  );
}
