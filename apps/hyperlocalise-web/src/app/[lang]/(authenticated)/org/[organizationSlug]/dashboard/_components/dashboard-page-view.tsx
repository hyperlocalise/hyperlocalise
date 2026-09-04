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
import Image from "next/image";
import Link from "next/link";
import { Chat01Icon, DashboardSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import type {
  OverviewActivityItem,
  OverviewAutomationItem,
  OverviewBoardItem,
  OverviewProjectItem,
  WorkspaceOverviewSnapshot,
} from "@/lib/workspace/overview-snapshot-model";

import { OverviewConnectAgentCard } from "../../_components/overview/overview-connect-agent-card";
import { IssuePriorityIcon } from "../../_components/issue-detail/issue-priority-icon";
import {
  formatCompactRelativeTimestamp,
  formatRelativeTimestamp,
} from "../../_components/workspace-files-shared";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { PROJECT_OVERVIEW_CALM_MESH_SRC } from "../../projects/[projectId]/_components/project-overview-mesh-stage";
import { recordRecentProjectVisit } from "../../projects/_components/recent-projects";
import { dashboardPageViewMessages } from "./dashboard-page-view.messages";

const SPARKLINE_MIN_HEIGHT_PX = 10;
const SPARKLINE_MAX_HEIGHT_PX = 40;
const SPARKLINE_BAR_CLASSES = [
  "bg-dew-100",
  "bg-dew-500",
  "bg-dew-500",
  "bg-primary",
  "bg-dew-700",
  "bg-dew-100",
  "bg-dew-700",
] as const;

const STATUS_PILL_CLASSES: Record<string, string> = {
  succeeded: "bg-green-100 text-green-900",
  failed: "bg-red-100 text-red-900",
  running: "bg-blue-100 text-dew-900",
  queued: "bg-amber-100 text-amber-900",
  waiting_for_review: "bg-amber-100 text-amber-900",
  cancelled: "bg-amber-100 text-amber-900",
  skipped: "bg-amber-100 text-amber-900",
};

const AUTOMATION_TRIGGER_SOURCE_MESSAGES = {
  manual: dashboardPageViewMessages.triggerManual,
  scheduled: dashboardPageViewMessages.triggerScheduled,
  github: dashboardPageViewMessages.triggerGithub,
  contentful: dashboardPageViewMessages.triggerContentful,
  source_upload: dashboardPageViewMessages.triggerSourceUpload,
  web_chat: dashboardPageViewMessages.triggerWebChat,
} as const;

export type DashboardLinkRenderer = (props: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) => ReactNode;

function defaultRenderLink({
  href,
  className,
  children,
  onClick,
}: Parameters<DashboardLinkRenderer>[0]) {
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

function formatStatusLabel(status: string, intl: IntlShape) {
  switch (status) {
    case "queued":
      return intl.formatMessage(dashboardPageViewMessages.runStatusQueued);
    case "running":
      return intl.formatMessage(dashboardPageViewMessages.runStatusRunning);
    case "succeeded":
      return intl.formatMessage(dashboardPageViewMessages.runStatusSucceeded);
    case "failed":
      return intl.formatMessage(dashboardPageViewMessages.runStatusFailed);
    case "cancelled":
      return intl.formatMessage(dashboardPageViewMessages.runStatusCancelled);
    case "skipped":
      return intl.formatMessage(dashboardPageViewMessages.runStatusSkipped);
    case "waiting_for_review":
      return intl.formatMessage(dashboardPageViewMessages.jobStatusWaiting);
    default:
      return status.replaceAll("_", " ");
  }
}

function formatTriggerSource(triggerSource: string, intl: IntlShape) {
  const message =
    AUTOMATION_TRIGGER_SOURCE_MESSAGES[
      triggerSource as keyof typeof AUTOMATION_TRIGGER_SOURCE_MESSAGES
    ];
  return message ? intl.formatMessage(message) : triggerSource.replaceAll("_", " ");
}

function Sparkline({ series }: { series: readonly number[] }) {
  const peak = Math.max(...series, 1);

  return (
    <div className="flex h-10 w-full shrink-0 items-end gap-[5px]" aria-hidden>
      {series.map((value, index) => (
        <div
          key={index}
          className={cn(
            "grow rounded-[2px]",
            SPARKLINE_BAR_CLASSES[index % SPARKLINE_BAR_CLASSES.length],
          )}
          style={{
            height: `${SPARKLINE_MIN_HEIGHT_PX + (value / peak) * (SPARKLINE_MAX_HEIGHT_PX - SPARKLINE_MIN_HEIGHT_PX)}px`,
          }}
        />
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const intl = useIntl();

  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium capitalize",
        STATUS_PILL_CLASSES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {formatStatusLabel(status, intl)}
    </span>
  );
}

function OverviewSectionHeader({
  label,
  href,
  hrefLabel,
  renderLink,
}: {
  label: string;
  href: string;
  hrefLabel: string;
  renderLink: DashboardLinkRenderer;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[13px] leading-5 font-semibold tracking-[0.04em] text-muted-foreground uppercase">
        {label}
      </p>
      {renderLink({
        href,
        className: "text-[13px] leading-5 font-medium text-foreground hover:underline",
        children: hrefLabel,
      })}
    </div>
  );
}

function OverviewFeed({
  isLoading,
  isError,
  isEmpty,
  emptyMessage,
  errorMessage,
  loadingLabel,
  children,
}: {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyMessage: string;
  errorMessage: string;
  loadingLabel: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label={loadingLabel}>
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || isEmpty) {
    return (
      <div className="rounded-xl border border-border px-4 py-5">
        <TypographyP size="small" tone="subtle">
          {isError ? errorMessage : emptyMessage}
        </TypographyP>
      </div>
    );
  }

  return <div className="flex flex-col gap-3">{children}</div>;
}

function OverviewMetricCard({
  label,
  value,
  detail,
  series,
}: {
  label: string;
  value: number;
  detail: string;
  series?: readonly number[];
}) {
  const intl = useIntl();

  return (
    <div className="flex min-h-[148px] min-w-0 flex-1 basis-0 flex-col gap-4 rounded-xl border border-border bg-card px-4 pt-4 pb-[18px]">
      <p className="text-[13px] leading-5 font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-1">
        <p className="text-3xl/loose font-medium tracking-[-0.03em] text-foreground tabular-nums">
          {intl.formatNumber(value)}
        </p>
        <p className="text-[13px] leading-5 text-muted-foreground">{detail}</p>
      </div>
      {series ? <Sparkline series={series} /> : null}
    </div>
  );
}

function OverviewMetricsTray({
  overview,
  isLoading,
  loadingLabel,
}: {
  overview: WorkspaceOverviewSnapshot;
  isLoading: boolean;
  loadingLabel: string;
}) {
  const intl = useIntl();

  return (
    <section
      className="relative overflow-clip rounded-3xl border border-border p-3"
      aria-busy={isLoading || undefined}
      aria-label={isLoading ? loadingLabel : undefined}
    >
      <Image
        src={PROJECT_OVERVIEW_CALM_MESH_SRC}
        alt=""
        aria-hidden
        fill
        sizes="(min-width: 1280px) 72rem, 100vw"
        className="object-cover object-center"
        priority
      />
      <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          <>
            <Skeleton className="min-h-[148px] rounded-xl" />
            <Skeleton className="min-h-[148px] rounded-xl" />
            <Skeleton className="min-h-[148px] rounded-xl" />
            <Skeleton className="min-h-[148px] rounded-xl" />
          </>
        ) : (
          <>
            <OverviewMetricCard
              label={intl.formatMessage(dashboardPageViewMessages.jobsMetric)}
              value={overview.metrics.jobs.count}
              detail={intl.formatMessage(dashboardPageViewMessages.lastSevenDays)}
              series={overview.metrics.jobs.series}
            />
            <OverviewMetricCard
              label={intl.formatMessage(dashboardPageViewMessages.translationsMetric)}
              value={overview.metrics.translations.count}
              detail={intl.formatMessage(dashboardPageViewMessages.lastSevenDays)}
              series={overview.metrics.translations.series}
            />
            <OverviewMetricCard
              label={intl.formatMessage(dashboardPageViewMessages.automationsMetric)}
              value={overview.metrics.automations.total}
              detail={intl.formatMessage(dashboardPageViewMessages.pausedCount, {
                count: overview.metrics.automations.paused,
              })}
            />
            <OverviewMetricCard
              label={intl.formatMessage(dashboardPageViewMessages.issuesMetric)}
              value={overview.metrics.issues.open}
              detail={intl.formatMessage(dashboardPageViewMessages.p1Count, {
                count: overview.metrics.issues.p1,
              })}
            />
          </>
        )}
      </div>
    </section>
  );
}

export function DashboardPageView({
  organizationSlug,
  overview,
  automationsEnabled = false,
  isLoading = false,
  isError = false,
  onNewRequest,
  slackConnectCard,
  renderLink = defaultRenderLink,
}: {
  organizationSlug: string;
  overview: WorkspaceOverviewSnapshot;
  automationsEnabled?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onNewRequest: () => void;
  slackConnectCard?: ReactNode;
  renderLink?: DashboardLinkRenderer;
}) {
  const intl = useIntl();
  const jobsHref = `/org/${organizationSlug}/jobs`;
  const projectsHref = `/org/${organizationSlug}/projects`;
  const issuesHref = `/org/${organizationSlug}/issues`;
  const automationsHref = `/org/${organizationSlug}/automations`;
  const loadingLabel = intl.formatMessage(dashboardPageViewMessages.loadingWorkspaceOverview);
  const errorMessage = intl.formatMessage(dashboardPageViewMessages.overviewLoadError);

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={DashboardSquare01Icon}
        label={intl.formatMessage(dashboardPageViewMessages.pageLabel)}
        title={intl.formatMessage(dashboardPageViewMessages.pageTitle)}
        description={intl.formatMessage(dashboardPageViewMessages.pageDescription)}
        actions={
          <Button type="button" className="w-full sm:w-fit" onClick={onNewRequest}>
            <HugeiconsIcon icon={Chat01Icon} strokeWidth={1.8} />
            <FormattedMessage {...dashboardPageViewMessages.newRequest} />
          </Button>
        }
      />

      <OverviewMetricsTray overview={overview} isLoading={isLoading} loadingLabel={loadingLabel} />

      <section className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex w-full min-w-0 flex-col gap-3 lg:w-[420px] lg:shrink-0">
          <OverviewSectionHeader
            label={intl.formatMessage(dashboardPageViewMessages.activityLabel)}
            href={jobsHref}
            hrefLabel={intl.formatMessage(dashboardPageViewMessages.viewJobs)}
            renderLink={renderLink}
          />
          <OverviewFeed
            isLoading={isLoading}
            isError={isError}
            isEmpty={overview.activity.length === 0}
            emptyMessage={intl.formatMessage(dashboardPageViewMessages.activityEmpty)}
            errorMessage={errorMessage}
            loadingLabel={loadingLabel}
          >
            {overview.activity.map((item) => (
              <OverviewActivityRow key={item.id} item={item} renderLink={renderLink} />
            ))}
          </OverviewFeed>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <OverviewSectionHeader
            label={intl.formatMessage(dashboardPageViewMessages.projectsLabel)}
            href={projectsHref}
            hrefLabel={intl.formatMessage(dashboardPageViewMessages.viewAll)}
            renderLink={renderLink}
          />
          <OverviewFeed
            isLoading={isLoading}
            isError={isError}
            isEmpty={overview.projects.length === 0}
            emptyMessage={intl.formatMessage(dashboardPageViewMessages.projectsEmpty)}
            errorMessage={errorMessage}
            loadingLabel={loadingLabel}
          >
            {overview.projects.map((project) => (
              <OverviewProjectRow
                key={project.id}
                organizationSlug={organizationSlug}
                project={project}
                renderLink={renderLink}
              />
            ))}
          </OverviewFeed>
        </div>
      </section>

      <section
        className={cn(
          "flex flex-col gap-4",
          automationsEnabled ? "lg:flex-row lg:items-start" : "",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <OverviewSectionHeader
            label={intl.formatMessage(dashboardPageViewMessages.boardLabel)}
            href={issuesHref}
            hrefLabel={intl.formatMessage(dashboardPageViewMessages.viewBoard)}
            renderLink={renderLink}
          />
          <OverviewFeed
            isLoading={isLoading}
            isError={isError}
            isEmpty={overview.board.length === 0}
            emptyMessage={intl.formatMessage(dashboardPageViewMessages.boardEmpty)}
            errorMessage={errorMessage}
            loadingLabel={loadingLabel}
          >
            {overview.board.map((issue) => (
              <OverviewBoardRow key={issue.id} issue={issue} renderLink={renderLink} />
            ))}
          </OverviewFeed>
        </div>

        {automationsEnabled ? (
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <OverviewSectionHeader
              label={intl.formatMessage(dashboardPageViewMessages.automationsLabel)}
              href={automationsHref}
              hrefLabel={intl.formatMessage(dashboardPageViewMessages.viewAutomations)}
              renderLink={renderLink}
            />
            <OverviewFeed
              isLoading={isLoading}
              isError={isError}
              isEmpty={overview.automations.length === 0}
              emptyMessage={intl.formatMessage(dashboardPageViewMessages.automationsEmpty)}
              errorMessage={errorMessage}
              loadingLabel={loadingLabel}
            >
              {overview.automations.map((run) => (
                <OverviewAutomationRow key={run.id} run={run} renderLink={renderLink} />
              ))}
            </OverviewFeed>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <OverviewConnectAgentCard compact className="min-w-0 flex-1" />
        {slackConnectCard}
      </section>
    </WorkspacePageShell>
  );
}

function OverviewActivityRow({
  item,
  renderLink,
}: {
  item: OverviewActivityItem;
  renderLink: DashboardLinkRenderer;
}) {
  const intl = useIntl();
  const title = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="truncate text-[13px] leading-5 font-medium text-foreground">{item.title}</p>
      <p className="truncate text-xs leading-4 text-muted-foreground">{item.subtitle}</p>
    </div>
  );

  return (
    <div
      className={cn(
        "flex w-full gap-2.5 rounded-xl border border-border px-3",
        item.attention ? "items-start bg-background p-3" : "items-center py-2.5",
      )}
    >
      {item.attention ? (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-red-800" aria-hidden />
      ) : null}
      {item.href
        ? renderLink({
            href: item.href,
            className: "flex min-w-0 flex-1 items-center gap-2.5",
            children: title,
          })
        : title}
      {item.attention && item.href ? (
        renderLink({
          href: item.href,
          className: "shrink-0 text-[13px] leading-5 font-semibold text-primary",
          children: intl.formatMessage(dashboardPageViewMessages.openAction),
        })
      ) : (
        <StatusPill status={item.status} />
      )}
    </div>
  );
}

function OverviewProjectRow({
  organizationSlug,
  project,
  renderLink,
}: {
  organizationSlug: string;
  project: OverviewProjectItem;
  renderLink: DashboardLinkRenderer;
}) {
  const intl = useIntl();
  const latestMeta = [
    project.localeRoute,
    project.latestJobAt ? formatRelativeTimestamp(project.latestJobAt) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return renderLink({
    href: project.href,
    className:
      "flex flex-col gap-4 rounded-xl border border-border bg-background p-4 hover:bg-muted/40",
    onClick: () => {
      recordRecentProjectVisit(organizationSlug, project.id);
    },
    children: (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-sm leading-5 font-semibold text-foreground">
              {project.name}
            </p>
            <p className="truncate text-[13px] leading-5 text-muted-foreground">
              {project.subtitle}
            </p>
          </div>
          {project.failedCount > 0 ? (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-red-100 px-2 text-xs font-medium text-red-900">
              {intl.formatMessage(dashboardPageViewMessages.projectFailedCount, {
                count: project.failedCount,
              })}
            </span>
          ) : (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-blue-100 px-2 text-xs font-medium text-dew-900">
              {intl.formatMessage(dashboardPageViewMessages.projectOpenCount, {
                count: project.openCount,
              })}
            </span>
          )}
        </div>
        {project.latestJobTitle ? (
          <div className="flex flex-col gap-1">
            <p className="truncate text-[13px] leading-5 font-medium text-foreground">
              {project.latestJobTitle}
            </p>
            {latestMeta ? (
              <p className="truncate text-xs leading-4 text-muted-foreground">{latestMeta}</p>
            ) : null}
          </div>
        ) : null}
      </>
    ),
  });
}

function OverviewBoardRow({
  issue,
  renderLink,
}: {
  issue: OverviewBoardItem;
  renderLink: DashboardLinkRenderer;
}) {
  return renderLink({
    href: issue.href,
    className:
      "flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 hover:bg-muted/40",
    children: (
      <>
        <IssuePriorityIcon
          priority={issue.priority}
          size="sm"
          className={issue.priority === "P1" ? "bg-amber-600 text-[11px]" : "text-[11px]"}
        />
        <span className="w-12 shrink-0 font-mono text-xs leading-4 text-muted-foreground">
          {issue.identifier}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-[13px] leading-5 font-medium text-foreground">
            {issue.title}
          </p>
          <p className="truncate text-xs leading-4 text-muted-foreground">
            {[issue.projectName, issue.locale].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="flex w-8 shrink-0 justify-end text-right text-xs leading-4 text-muted-foreground">
          {formatCompactRelativeTimestamp(issue.updatedAt)}
        </span>
      </>
    ),
  });
}

function OverviewAutomationRow({
  run,
  renderLink,
}: {
  run: OverviewAutomationItem;
  renderLink: DashboardLinkRenderer;
}) {
  const intl = useIntl();

  return renderLink({
    href: run.href,
    className:
      "flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 hover:bg-muted/40",
    children: (
      <>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-[13px] leading-5 font-medium text-foreground">{run.name}</p>
          <p className="truncate text-xs leading-4 text-muted-foreground">
            {formatTriggerSource(run.triggerSource, intl)}
            {` · ${formatCompactRelativeTimestamp(run.updatedAt)}`}
          </p>
        </div>
        <StatusPill status={run.status} />
      </>
    ),
  });
}
