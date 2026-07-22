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
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import {
  formatJobKind,
  formatRelativeTime,
  getJobName,
  JobSourceLabel,
  jobTone,
  taskDetailSummary,
  type JobRow,
  type JobsLinkRenderer,
} from "./jobs-page-view";
import {
  buildJobCatHref,
  buildJobDetailHref,
  isKanbanStatus,
  kanbanStatusColumns,
  type KanbanStatus,
} from "./jobs-view-helpers";
import { getKanbanStatusMessage, jobsKanbanBoardMessages } from "./jobs-kanban-board.messages";
import { getJobStatusMessage } from "./jobs-page-view.messages";
import { toneClass, type Tone } from "../../_components/workspace-resource-shared";

type KanbanColumnDef = {
  key: string;
  label: string;
  statusTone: Tone;
  jobs: JobRow[];
};

export function JobRowActions({
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  job,
  organizationSlug,
  projectId,
  renderJobLink,
}: {
  buildJobDetailHref?: typeof buildJobDetailHref;
  job: JobRow;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
}) {
  const intl = useIntl();
  const resolvedProjectId = projectId ?? job.projectId;
  const detailHref = buildDetailHref(organizationSlug, resolvedProjectId, job.id);
  const catHref = buildJobCatHref(organizationSlug, resolvedProjectId, job);
  const detailsLabel = intl.formatMessage(jobsKanbanBoardMessages.details);
  const viewStringsLabel = intl.formatMessage(jobsKanbanBoardMessages.viewStrings);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {detailHref ? (
        renderJobLink({ href: detailHref, kind: "details", children: detailsLabel })
      ) : (
        <Button variant="outline" size="sm" className="w-fit" disabled>
          {detailsLabel}
        </Button>
      )}
      {catHref ? renderJobLink({ href: catHref, kind: "cat", children: viewStringsLabel }) : null}
    </div>
  );
}

function JobKanbanCard({
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  job,
  now,
  organizationSlug,
  projectId,
  renderJobLink,
}: {
  buildJobDetailHref?: typeof buildJobDetailHref;
  job: JobRow;
  now?: number;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
}) {
  const intl = useIntl();
  const resolvedProjectId = projectId ?? job.projectId;
  const detailHref = buildDetailHref(organizationSlug, resolvedProjectId, job.id);

  return (
    <article className="rounded-lg border border-border bg-background p-3 shadow-sm">
      {detailHref ? (
        renderJobLink({
          href: detailHref,
          kind: "title",
          children: (
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {getJobName(job, intl)}
              </span>
              <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
                <FormattedMessage
                  {...jobsKanbanBoardMessages.kindWithTaskId}
                  values={{
                    kind: formatJobKind(job, intl),
                    taskId: job.externalTaskId ?? job.id,
                  }}
                />
              </span>
            </span>
          ),
        })
      ) : (
        <div className="min-w-0">
          <TypographyP className="truncate text-sm font-medium text-foreground">
            {getJobName(job, intl)}
          </TypographyP>
          <TypographyP className="mt-1 truncate text-xs text-muted-foreground">
            <FormattedMessage
              {...jobsKanbanBoardMessages.kindWithTaskId}
              values={{
                kind: formatJobKind(job, intl),
                taskId: job.externalTaskId ?? job.id,
              }}
            />
          </TypographyP>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <JobSourceLabel job={job} compact />
        {!projectId ? (
          <Badge variant="outline" className="w-fit rounded-full text-[11px]">
            {job.projectName ??
              job.projectId ??
              intl.formatMessage(jobsKanbanBoardMessages.workspaceFallback)}
          </Badge>
        ) : null}
      </div>

      <TypographyP className="mt-3 line-clamp-2 text-xs text-subtle-foreground">
        {taskDetailSummary(job, intl)}
      </TypographyP>
      <TypographyP className="mt-1 text-[11px] text-muted-foreground">
        <FormattedMessage
          {...jobsKanbanBoardMessages.dueMeta}
          values={{
            due: formatRelativeTime(job.externalDueDate, now),
          }}
        />
      </TypographyP>

      <div className="mt-3 border-t border-border pt-3">
        <JobRowActions
          buildJobDetailHref={buildDetailHref}
          job={job}
          organizationSlug={organizationSlug}
          projectId={projectId}
          renderJobLink={renderJobLink}
        />
      </div>
    </article>
  );
}

function KanbanColumn({
  jobs,
  label,
  statusTone,
  ...cardProps
}: {
  jobs: JobRow[];
  label: string;
  statusTone: Tone;
} & Omit<Parameters<typeof JobKanbanCard>[0], "job">) {
  return (
    <section className="flex min-w-[17rem] flex-1 flex-col rounded-xl border border-border bg-muted">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <TypographyP className="text-sm font-medium text-foreground">{label}</TypographyP>
        <Badge variant="outline" className={cn("rounded-full", toneClass(statusTone))}>
          {jobs.length}
        </Badge>
      </header>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {jobs.length === 0 ? (
          <TypographyP className="px-1 py-6 text-center text-xs text-muted-foreground">
            <FormattedMessage {...jobsKanbanBoardMessages.noJobs} />
          </TypographyP>
        ) : (
          jobs.map((job) => <JobKanbanCard key={job.id} job={job} {...cardProps} />)
        )}
      </div>
    </section>
  );
}

function KanbanColumnSkeleton({ label }: { label: string }) {
  return (
    <section className="flex min-w-[17rem] flex-1 flex-col rounded-xl border border-border bg-muted">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <TypographyP className="text-sm font-medium text-foreground">{label}</TypographyP>
        <Skeleton className="h-5 w-8 rounded-full" />
      </header>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="space-y-3 rounded-lg border border-border bg-background p-3 shadow-sm"
          >
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <div className="border-t border-border pt-3">
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function JobsKanbanBoardSkeleton() {
  const intl = useIntl();

  return (
    <div
      className="overflow-x-auto pb-1"
      aria-busy="true"
      aria-label={intl.formatMessage(jobsKanbanBoardMessages.loadingBoardAriaLabel)}
    >
      <div className="flex min-w-max gap-3">
        {kanbanStatusColumns.map((status) => (
          <KanbanColumnSkeleton
            key={status}
            label={intl.formatMessage(getKanbanStatusMessage(status))}
          />
        ))}
      </div>
    </div>
  );
}

export function JobsKanbanBoard({
  buildJobDetailHref: buildDetailHref = buildJobDetailHref,
  emptyLabel,
  isLoading,
  jobs,
  now,
  organizationSlug,
  projectId,
  renderJobLink,
}: {
  buildJobDetailHref?: typeof buildJobDetailHref;
  emptyLabel: string;
  isLoading: boolean;
  jobs: JobRow[];
  now?: number;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
}) {
  const intl = useIntl();

  if (isLoading) {
    return <JobsKanbanBoardSkeleton />;
  }

  if (jobs.length === 0) {
    return (
      <TypographyP className="px-3 py-8 text-sm text-muted-foreground">{emptyLabel}</TypographyP>
    );
  }

  const jobsByStatus = new Map<KanbanStatus, JobRow[]>();
  for (const status of kanbanStatusColumns) {
    jobsByStatus.set(status, []);
  }

  const unknownStatusJobs: JobRow[] = [];
  for (const job of jobs) {
    const status = job.status as string;
    if (isKanbanStatus(status)) {
      jobsByStatus.get(status)?.push(job);
      continue;
    }

    if (process.env.NODE_ENV !== "production") {
      console.warn(`[JobsKanbanBoard] Unknown job status "${status}" for job ${job.id}`);
    }
    unknownStatusJobs.push(job);
  }

  const columns: KanbanColumnDef[] = kanbanStatusColumns
    .filter((status) => (jobsByStatus.get(status)?.length ?? 0) > 0)
    .map((status) => ({
      key: status,
      label: intl.formatMessage(getJobStatusMessage(status)),
      statusTone: jobTone(status),
      jobs: jobsByStatus.get(status) ?? [],
    }));

  if (unknownStatusJobs.length > 0) {
    columns.push({
      key: "other",
      label: intl.formatMessage(jobsKanbanBoardMessages.otherColumn),
      statusTone: "watch",
      jobs: unknownStatusJobs,
    });
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-3">
        {columns.map((column) => (
          <KanbanColumn
            key={column.key}
            label={column.label}
            statusTone={column.statusTone}
            jobs={column.jobs}
            buildJobDetailHref={buildDetailHref}
            now={now}
            organizationSlug={organizationSlug}
            projectId={projectId}
            renderJobLink={renderJobLink}
          />
        ))}
      </div>
    </div>
  );
}
