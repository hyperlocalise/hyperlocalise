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
import { useState, type ComponentType } from "react";
import {
  ArrowsInLineHorizontalIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CircleHalfIcon,
  ClockIcon,
  EyeIcon,
  ProhibitIcon,
  QuestionIcon,
  RobotIcon,
  WarningIcon,
  XCircleIcon,
  type IconProps,
  type IconWeight,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";
import {
  formatJobFailureReason,
  readJobFailureDetails,
} from "@/lib/projects/jobs/job-failure-details";
import { TmsProviderBrandMark } from "@/lib/providers/shared/tms-provider-brand-mark";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";

import {
  formatJobKind,
  formatRelativeTime,
  getJobName,
  getJobTargetLocaleIds,
  type JobRow,
  type JobsLinkRenderer,
} from "./jobs-page-view";
import {
  boardStatusColumns,
  buildJobContentEditorHref,
  buildJobDetailHref,
  getDueUrgency,
  isKanbanStatus,
  isTerminalBoardStatus,
  sortBoardJobs,
  type KanbanStatus,
} from "./jobs-view-helpers";
import { jobsKanbanBoardMessages } from "./jobs-kanban-board.messages";
import { getJobStatusMessage, jobsPageViewMessages } from "./jobs-page-view.messages";
import { formatLocaleList } from "./provider-crowdin-job-display";

type ColumnKey = KanbanStatus | "other";

type ColumnStyle = {
  icon: ComponentType<IconProps>;
  iconWeight: IconWeight;
  iconClassName: string;
  accentClassName: string;
  surfaceClassName: string;
  countClassName: string;
};

/*
 * Only the columns that need a person (review, failed) get a tinted surface, so attention
 * lands there first. Every status also carries a distinct icon so color is never the only cue.
 */
const columnStyles: Record<ColumnKey, ColumnStyle> = {
  queued: {
    icon: CircleDashedIcon,
    iconWeight: "bold",
    iconClassName: "text-gray-700",
    accentClassName: "border-t-gray-500",
    surfaceClassName: "bg-muted/50",
    countClassName: "bg-gray-200 text-gray-900",
  },
  running: {
    icon: CircleHalfIcon,
    iconWeight: "fill",
    iconClassName: "text-blue-700",
    accentClassName: "border-t-blue-700",
    surfaceClassName: "bg-muted/50",
    countClassName: "bg-blue-200 text-blue-900",
  },
  waiting_for_review: {
    icon: EyeIcon,
    iconWeight: "bold",
    iconClassName: "text-amber-800",
    accentClassName: "border-t-amber-700",
    surfaceClassName: "bg-amber-100/70",
    countClassName: "bg-amber-200 text-amber-900",
  },
  failed: {
    icon: XCircleIcon,
    iconWeight: "fill",
    iconClassName: "text-red-800",
    accentClassName: "border-t-red-700",
    surfaceClassName: "bg-red-100/70",
    countClassName: "bg-red-200 text-red-900",
  },
  succeeded: {
    icon: CheckCircleIcon,
    iconWeight: "fill",
    iconClassName: "text-green-800",
    accentClassName: "border-t-green-700",
    surfaceClassName: "bg-muted/50",
    countClassName: "bg-green-200 text-green-900",
  },
  cancelled: {
    icon: ProhibitIcon,
    iconWeight: "bold",
    iconClassName: "text-gray-600",
    accentClassName: "border-t-gray-400",
    surfaceClassName: "bg-muted/50",
    countClassName: "bg-gray-200 text-gray-800",
  },
  other: {
    icon: QuestionIcon,
    iconWeight: "bold",
    iconClassName: "text-gray-600",
    accentClassName: "border-t-gray-400",
    surfaceClassName: "bg-muted/50",
    countClassName: "bg-gray-200 text-gray-800",
  },
};

const BOARD_HEIGHT_CLASS_NAME = "h-[calc(100dvh-16rem)] min-h-[28rem]";
const COLUMN_WIDTH_CLASS_NAME = "w-76";
const DEFAULT_COLLAPSED_COLUMNS: readonly ColumnKey[] = ["cancelled"];
const CLOSED_COLUMN_VISIBLE_LIMIT = 20;
const MAX_VISIBLE_LOCALES = 2;
const MAX_VISIBLE_ASSIGNEES = 2;

type BoardColumnData = {
  key: ColumnKey;
  jobs: JobRow[];
};

type CardSharedProps = {
  buildJobDetailHref: typeof buildJobDetailHref;
  now?: number;
  organizationSlug: string;
  projectId?: string;
  renderJobLink: JobsLinkRenderer;
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
  const contentEditorHref = buildJobContentEditorHref(organizationSlug, resolvedProjectId, job);
  const detailsLabel = intl.formatMessage(jobsKanbanBoardMessages.details);
  const openEditorLabel = intl.formatMessage(jobsKanbanBoardMessages.openEditor);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {detailHref ? (
        renderJobLink({ href: detailHref, kind: "details", children: detailsLabel })
      ) : (
        <Button variant="outline" size="sm" className="w-fit" disabled>
          {detailsLabel}
        </Button>
      )}
      {contentEditorHref
        ? renderJobLink({
            href: contentEditorHref,
            kind: "content-editor",
            children: openEditorLabel,
          })
        : null}
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function LocaleChips({ localeIds }: { localeIds: string[] }) {
  const intl = useIntl();
  const visible = localeIds.slice(0, MAX_VISIBLE_LOCALES);
  const hiddenCount = localeIds.length - visible.length;

  return (
    <span
      className="flex min-w-0 items-center gap-1 overflow-hidden"
      title={formatLocaleList(localeIds)}
    >
      {visible.map((localeId) => (
        <span
          key={localeId}
          className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground"
        >
          {localeId}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="shrink-0 text-[11px] leading-none text-muted-foreground">
          {intl.formatMessage(jobsKanbanBoardMessages.moreLocales, { count: hiddenCount })}
        </span>
      ) : null}
    </span>
  );
}

function DueChip({ job, now }: { job: JobRow; now?: number }) {
  const intl = useIntl();
  const urgency = getDueUrgency(job.externalDueDate, now ?? Date.now());
  if (!urgency) return null;

  const due = formatRelativeTime(job.externalDueDate, now);
  const isClosed = isTerminalBoardStatus(job.status);
  const isOverdue = urgency === "overdue" && !isClosed;
  const isSoon = urgency === "soon" && !isClosed;
  const Icon = isOverdue ? WarningIcon : ClockIcon;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-none font-medium",
        isOverdue
          ? "bg-red-100 text-red-900"
          : isSoon
            ? "bg-amber-100 text-amber-900"
            : "text-muted-foreground",
      )}
      title={intl.formatMessage(
        isOverdue ? jobsKanbanBoardMessages.overdueMeta : jobsKanbanBoardMessages.dueMeta,
        { due },
      )}
    >
      <Icon className="size-3" weight={isOverdue ? "fill" : "regular"} />
      {due}
    </span>
  );
}

function Assignees({ job }: { job: JobRow }) {
  const intl = useIntl();
  const users = job.externalAssignedUsers ?? [];

  if (users.length === 0) {
    if (job.assigneeType !== "agent") return null;
    return (
      <Avatar
        size="sm"
        className="size-5"
        title={intl.formatMessage(jobsPageViewMessages.assigneeAgent)}
      >
        <AvatarFallback className="bg-purple-100 text-purple-900">
          <RobotIcon className="size-3" weight="bold" />
        </AvatarFallback>
      </Avatar>
    );
  }

  const visible = users.slice(0, MAX_VISIBLE_ASSIGNEES);
  const hiddenCount = users.length - visible.length;

  return (
    <AvatarGroup className="shrink-0 -space-x-1.5" title={users.join(", ")}>
      {visible.map((user) => (
        <Avatar key={user} size="sm" className="size-5">
          <AvatarFallback className="text-[9px] font-medium">{getInitials(user)}</AvatarFallback>
        </Avatar>
      ))}
      {hiddenCount > 0 ? (
        <AvatarGroupCount className="size-5 text-[9px]">
          {intl.formatMessage(jobsKanbanBoardMessages.moreAssignees, { count: hiddenCount })}
        </AvatarGroupCount>
      ) : null}
    </AvatarGroup>
  );
}

function JobBoardCard({
  buildJobDetailHref: buildDetailHref,
  job,
  now,
  organizationSlug,
  projectId,
  renderJobLink,
}: CardSharedProps & { job: JobRow }) {
  const intl = useIntl();
  const resolvedProjectId = projectId ?? job.projectId;
  const detailHref = buildDetailHref(organizationSlug, resolvedProjectId, job.id);
  const contentEditorHref = buildJobContentEditorHref(organizationSlug, resolvedProjectId, job);
  const name = getJobName(job, intl);
  const providerName = getTmsProviderBranding(job.externalProviderKind).name;
  const openEditorLabel = intl.formatMessage(jobsKanbanBoardMessages.openEditor);
  const failureReason = job.status === "failed" ? readJobFailureDetails(job).reason : null;
  const localeIds = getJobTargetLocaleIds(job);
  const hasAssignees = (job.externalAssignedUsers?.length ?? 0) > 0 || job.assigneeType === "agent";
  const hasMeta =
    localeIds.length > 0 || Boolean(job.externalDueDate) || hasAssignees || !projectId;

  return (
    <article
      className={cn(
        "group/card relative rounded-lg border bg-background p-3 shadow-xs transition-[border-color,box-shadow] duration-150 hover:shadow-sm",
        job.status === "failed"
          ? "border-red-400 hover:border-red-500"
          : "border-border hover:border-gray-400",
      )}
    >
      {detailHref
        ? renderJobLink({
            href: detailHref,
            kind: "card",
            ariaLabel: intl.formatMessage(jobsKanbanBoardMessages.openJob, { name }),
            className:
              "absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
            children: null,
          })
        : null}

      <div className="flex items-center gap-1.5">
        <span title={providerName} className="shrink-0">
          <TmsProviderBrandMark
            providerKind={job.externalProviderKind}
            compact
            className="size-5 rounded-md p-0.5"
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          <FormattedMessage
            {...jobsKanbanBoardMessages.kindWithTaskId}
            values={{
              kind: formatJobKind(job, intl),
              taskId: job.externalTaskId ?? job.id,
            }}
          />
        </span>
        {contentEditorHref
          ? renderJobLink({
              href: contentEditorHref,
              kind: "content-editor",
              ariaLabel: openEditorLabel,
              className:
                "relative z-10 -my-1 size-7 shrink-0 px-0 opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
              children: <span className="sr-only">{openEditorLabel}</span>,
            })
          : null}
      </div>

      <p
        className="mt-1.5 line-clamp-2 text-sm leading-snug font-medium text-foreground"
        title={name}
      >
        {name}
      </p>

      {failureReason ? (
        <p className="mt-1.5 flex items-start gap-1 text-xs text-red-900" title={failureReason}>
          <WarningIcon className="mt-px size-3.5 shrink-0" weight="fill" />
          <span className="line-clamp-2">{formatJobFailureReason(failureReason)}</span>
        </p>
      ) : null}

      {hasMeta ? (
        <div className="mt-2.5 flex items-center gap-1.5">
          {localeIds.length > 0 ? <LocaleChips localeIds={localeIds} /> : null}
          {!projectId ? (
            <span className="min-w-0 truncate text-[11px] text-muted-foreground">
              {job.projectName ??
                job.projectId ??
                intl.formatMessage(jobsKanbanBoardMessages.workspaceFallback)}
            </span>
          ) : null}
          <span className="flex-1" />
          <DueChip job={job} now={now} />
          <Assignees job={job} />
        </div>
      ) : null}
    </article>
  );
}

function CollapsedColumnRail({
  columnKey,
  count,
  label,
  onExpand,
}: {
  columnKey: ColumnKey;
  count: number;
  label: string;
  onExpand: () => void;
}) {
  const intl = useIntl();
  const style = columnStyles[columnKey];
  const Icon = style.icon;

  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={intl.formatMessage(jobsKanbanBoardMessages.expandColumn, { status: label })}
      className={cn(
        "flex h-full w-11 shrink-0 flex-col items-center gap-3 rounded-xl border border-t-2 border-border py-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        style.accentClassName,
        style.surfaceClassName,
      )}
    >
      <Icon className={cn("size-4", style.iconClassName)} weight={style.iconWeight} />
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-xs leading-none font-medium tabular-nums",
          style.countClassName,
        )}
      >
        {count}
      </span>
      <span className="text-sm font-medium text-foreground [writing-mode:vertical-rl]">
        {label}
      </span>
    </button>
  );
}

function BoardColumn({
  column,
  isLimitExpanded,
  label,
  onCollapse,
  onExpandLimit,
  ...cardProps
}: CardSharedProps & {
  column: BoardColumnData;
  isLimitExpanded: boolean;
  label: string;
  onCollapse: () => void;
  onExpandLimit: () => void;
}) {
  const intl = useIntl();
  const style = columnStyles[column.key];
  const Icon = style.icon;
  const isClosedColumn = column.key !== "other" && isTerminalBoardStatus(column.key);
  const isLimited =
    isClosedColumn && !isLimitExpanded && column.jobs.length > CLOSED_COLUMN_VISIBLE_LIMIT;
  const visibleJobs = isLimited ? column.jobs.slice(0, CLOSED_COLUMN_VISIBLE_LIMIT) : column.jobs;

  return (
    <section
      aria-label={intl.formatMessage(jobsKanbanBoardMessages.columnAriaLabel, {
        status: label,
        count: column.jobs.length,
      })}
      data-board-column={column.key}
      className={cn(
        "group/column flex h-full shrink-0 flex-col rounded-xl border border-t-2 border-border",
        COLUMN_WIDTH_CLASS_NAME,
        style.accentClassName,
        style.surfaceClassName,
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <Icon className={cn("size-4 shrink-0", style.iconClassName)} weight={style.iconWeight} />
        <h3 className="truncate text-sm font-medium text-foreground">{label}</h3>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs leading-none font-medium tabular-nums",
            style.countClassName,
          )}
        >
          {column.jobs.length}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="ms-auto text-muted-foreground opacity-0 transition-opacity group-hover/column:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label={intl.formatMessage(jobsKanbanBoardMessages.collapseColumn, { status: label })}
          onClick={onCollapse}
        >
          <ArrowsInLineHorizontalIcon />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {column.jobs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            <FormattedMessage {...jobsKanbanBoardMessages.noJobs} />
          </p>
        ) : (
          visibleJobs.map((job) => <JobBoardCard key={job.id} job={job} {...cardProps} />)
        )}
        {isLimited ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={onExpandLimit}
          >
            <FormattedMessage
              {...jobsKanbanBoardMessages.showMore}
              values={{ count: column.jobs.length - CLOSED_COLUMN_VISIBLE_LIMIT }}
            />
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function BoardColumnSkeleton({ columnKey, label }: { columnKey: KanbanStatus; label: string }) {
  const style = columnStyles[columnKey];
  const Icon = style.icon;

  if (DEFAULT_COLLAPSED_COLUMNS.includes(columnKey)) {
    return (
      <div
        className={cn(
          "flex h-full w-11 shrink-0 flex-col items-center gap-3 rounded-xl border border-t-2 border-border py-3",
          style.accentClassName,
          style.surfaceClassName,
        )}
      >
        <Icon className={cn("size-4", style.iconClassName)} weight={style.iconWeight} />
        <Skeleton className="h-4 w-5 rounded-full" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full shrink-0 flex-col rounded-xl border border-t-2 border-border",
        COLUMN_WIDTH_CLASS_NAME,
        style.accentClassName,
        style.surfaceClassName,
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <Icon className={cn("size-4 shrink-0", style.iconClassName)} weight={style.iconWeight} />
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Skeleton className="h-4 w-5 rounded-full" />
      </div>
      <div className="flex flex-col gap-2 px-2 pb-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="space-y-2.5 rounded-lg border border-border bg-background p-3"
          >
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
            <div className="flex gap-1">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="ms-auto size-5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobsKanbanBoardSkeleton() {
  const intl = useIntl();

  return (
    <div
      className={cn("overflow-x-auto pb-2", BOARD_HEIGHT_CLASS_NAME)}
      aria-busy="true"
      aria-label={intl.formatMessage(jobsKanbanBoardMessages.loadingBoardAriaLabel)}
    >
      <div className="flex h-full min-w-max gap-3">
        {boardStatusColumns.map((status) => (
          <BoardColumnSkeleton
            key={status}
            columnKey={status}
            label={intl.formatMessage(getJobStatusMessage(status))}
          />
        ))}
      </div>
    </div>
  );
}

function groupJobsIntoColumns(jobs: JobRow[]): BoardColumnData[] {
  const jobsByStatus = new Map<KanbanStatus, JobRow[]>(
    boardStatusColumns.map((status) => [status, []]),
  );
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

  const columns: BoardColumnData[] = boardStatusColumns.map((status) => ({
    key: status,
    jobs: sortBoardJobs(status, jobsByStatus.get(status) ?? []),
  }));

  if (unknownStatusJobs.length > 0) {
    columns.push({ key: "other", jobs: unknownStatusJobs });
  }

  return columns;
}

function toggleInSet<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
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
  const [collapsedColumns, setCollapsedColumns] = useState<ReadonlySet<ColumnKey>>(
    () => new Set(DEFAULT_COLLAPSED_COLUMNS),
  );
  const [expandedLimitColumns, setExpandedLimitColumns] = useState<ReadonlySet<ColumnKey>>(
    () => new Set(),
  );

  if (isLoading) {
    return <JobsKanbanBoardSkeleton />;
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const columns = groupJobsIntoColumns(jobs);

  return (
    <div className={cn("overflow-x-auto pb-2", BOARD_HEIGHT_CLASS_NAME)}>
      <div className="flex h-full min-w-max gap-3">
        {columns.map((column) => {
          const label =
            column.key === "other"
              ? intl.formatMessage(jobsKanbanBoardMessages.otherColumn)
              : intl.formatMessage(getJobStatusMessage(column.key));
          const toggleCollapsed = () =>
            setCollapsedColumns((current) => toggleInSet(current, column.key));

          if (collapsedColumns.has(column.key)) {
            return (
              <CollapsedColumnRail
                key={column.key}
                columnKey={column.key}
                count={column.jobs.length}
                label={label}
                onExpand={toggleCollapsed}
              />
            );
          }

          return (
            <BoardColumn
              key={column.key}
              column={column}
              label={label}
              isLimitExpanded={expandedLimitColumns.has(column.key)}
              onCollapse={toggleCollapsed}
              onExpandLimit={() =>
                setExpandedLimitColumns((current) => toggleInSet(current, column.key))
              }
              buildJobDetailHref={buildDetailHref}
              now={now}
              organizationSlug={organizationSlug}
              projectId={projectId}
              renderJobLink={renderJobLink}
            />
          );
        })}
      </div>
    </div>
  );
}
