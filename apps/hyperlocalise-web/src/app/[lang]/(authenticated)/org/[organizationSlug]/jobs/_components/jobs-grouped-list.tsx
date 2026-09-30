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
import { useState } from "react";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { JobRowActions } from "./jobs-kanban-board";
import { jobsGroupedListMessages as messages } from "./jobs-grouped-list.messages";
import {
  formatJobKind,
  formatRelativeTime,
  getJobName,
  JobSourceLabel,
  taskDetailSummary,
  type JobRow,
  type JobsLinkRenderer,
} from "./jobs-page-view";
import { getJobStatusMessage, jobsPageViewMessages } from "./jobs-page-view.messages";
import {
  buildJobDetailHref,
  isKanbanStatus,
  kanbanStatusColumns,
  type KanbanStatus,
} from "./jobs-view-helpers";

type JobStatusGroup = {
  status: KanbanStatus | "other";
  jobs: JobRow[];
  count: number;
};

function JobRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="h-4 w-64 max-w-[50%]" />
      <Skeleton className="ms-auto h-4 w-16" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-10" />
    </div>
  );
}

function groupJobsByStatus(jobs: JobRow[], activeStatus?: string): JobStatusGroup[] {
  const grouped = new Map<string, JobRow[]>();
  for (const status of kanbanStatusColumns) {
    grouped.set(status, []);
  }
  const unknown: JobRow[] = [];

  for (const job of jobs) {
    if (isKanbanStatus(job.status)) {
      grouped.get(job.status)?.push(job);
      continue;
    }
    unknown.push(job);
  }

  const statuses = activeStatus
    ? kanbanStatusColumns.filter((status) => status === activeStatus)
    : kanbanStatusColumns;

  const groups: JobStatusGroup[] = statuses.flatMap((status) => {
    const groupJobs = grouped.get(status) ?? [];
    if (groupJobs.length === 0) {
      return [];
    }
    return [{ status, jobs: groupJobs, count: groupJobs.length }];
  });

  if (!activeStatus && unknown.length > 0) {
    groups.push({ status: "other", jobs: unknown, count: unknown.length });
  }

  return groups;
}

function StatusGroupHeader({
  status,
  count,
  collapsed,
  onToggle,
}: {
  status: JobStatusGroup["status"];
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const intl = useIntl();
  const label =
    status === "other"
      ? intl.formatMessage(messages.otherGroup)
      : intl.formatMessage(getJobStatusMessage(status));
  const chevron = collapsed ? ArrowRight01Icon : ArrowDown01Icon;

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/40"
      aria-expanded={!collapsed}
      aria-label={intl.formatMessage(
        collapsed ? messages.expandGroupAria : messages.collapseGroupAria,
        {
          status: label,
        },
      )}
      onClick={onToggle}
    >
      <HugeiconsIcon icon={chevron} strokeWidth={2} className="size-3.5 text-muted-foreground" />
      <span>{label}</span>
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

function JobListItemTitle({ job }: { job: JobRow }) {
  const intl = useIntl();

  return (
    <span className="min-w-0">
      <span className="block truncate font-medium text-foreground">{getJobName(job, intl)}</span>
      <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
        <FormattedMessage
          {...jobsPageViewMessages.kindWithTaskId}
          values={{
            kind: formatJobKind(job, intl),
            taskId: job.externalTaskId ?? job.id,
          }}
        />
      </span>
    </span>
  );
}

function JobListRow({
  buildDetailHref,
  job,
  now,
  organizationSlug,
  projectId,
  renderJobLink,
  showProject,
}: {
  buildDetailHref: typeof buildJobDetailHref;
  job: JobRow;
  now?: number;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
  showProject: boolean;
}) {
  const intl = useIntl();
  const detailHref = buildDetailHref(organizationSlug, projectId ?? job.projectId, job.id);

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        {detailHref ? (
          renderJobLink({
            href: detailHref,
            kind: "title",
            children: <JobListItemTitle job={job} />,
          })
        ) : (
          <div className="min-w-0 px-0 py-1">
            <JobListItemTitle job={job} />
          </div>
        )}
      </div>
      <div className="hidden shrink-0 sm:block">
        <JobSourceLabel job={job} compact />
      </div>
      {showProject ? (
        <TypographyP
          className="hidden max-w-[7rem] min-w-0 md:block"
          lineClamp={1}
          size="small"
          tone="subtle"
        >
          {job.projectName ??
            job.projectId ??
            intl.formatMessage(jobsPageViewMessages.workspaceFallback)}
        </TypographyP>
      ) : null}
      <span className="hidden max-w-[10rem] min-w-0 truncate text-muted-foreground lg:inline">
        {taskDetailSummary(job, intl)}
      </span>
      <time
        className="min-w-[4.75rem] shrink-0 text-end text-muted-foreground tabular-nums"
        dateTime={job.externalDueDate ?? job.updatedAt}
        title={
          job.externalDueDate
            ? intl.formatMessage(jobsPageViewMessages.dueMeta, {
                due: formatRelativeTime(job.externalDueDate, now),
              })
            : formatRelativeTime(job.updatedAt, now)
        }
      >
        {job.externalDueDate
          ? formatRelativeTime(job.externalDueDate, now)
          : formatRelativeTime(job.updatedAt, now)}
      </time>
      <div className="shrink-0">
        <JobRowActions
          buildJobDetailHref={buildDetailHref}
          job={job}
          organizationSlug={organizationSlug}
          projectId={projectId}
          renderJobLink={renderJobLink}
        />
      </div>
    </div>
  );
}

export function JobsGroupedList({
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  emptyLabel,
  isLoading,
  jobs,
  now,
  organizationSlug,
  projectId,
  renderJobLink,
  activeStatus,
}: {
  buildJobDetailHref?: typeof buildJobDetailHref;
  emptyLabel: string;
  isLoading: boolean;
  jobs: JobRow[];
  now?: number;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
  activeStatus?: string;
}) {
  const intl = useIntl();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = groupJobsByStatus(jobs, activeStatus);
  const hideHeaders = Boolean(activeStatus);
  const showProject = !projectId;

  if (isLoading) {
    return (
      <div
        className="overflow-hidden rounded-xl border bg-card"
        aria-busy="true"
        aria-label={intl.formatMessage(messages.loadingAria)}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <JobRowSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {groups.map((group, groupIndex) => {
        const isCollapsed = hideHeaders ? false : (collapsed[group.status] ?? false);
        return (
          <section
            key={group.status}
            className={cn(groupIndex > 0 && "border-t")}
            data-status-group={group.status}
          >
            {hideHeaders ? null : (
              <StatusGroupHeader
                status={group.status}
                count={group.count}
                collapsed={isCollapsed}
                onToggle={() =>
                  setCollapsed((current) => ({
                    ...current,
                    [group.status]: !isCollapsed,
                  }))
                }
              />
            )}
            {isCollapsed ? null : (
              <div className={cn(!hideHeaders && "border-t border-border/60")}>
                {group.jobs.map((job) => (
                  <JobListRow
                    key={job.id}
                    buildDetailHref={buildDetailHref}
                    job={job}
                    now={now}
                    organizationSlug={organizationSlug}
                    projectId={projectId}
                    renderJobLink={renderJobLink}
                    showProject={showProject}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
