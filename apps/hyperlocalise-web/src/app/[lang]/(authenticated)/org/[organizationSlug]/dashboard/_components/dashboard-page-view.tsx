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
import { recordRecentProjectVisit } from "../../projects/_components/recent-projects";
import { dashboardPageViewMessages } from "./dashboard-page-view.messages";

const SPARKLINE_BAR_CLASSES = ["bg-dew-100", "bg-dew-500", "bg-primary", "bg-dew-700"] as const;

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
    <div className="flex h-10 items-end gap-0.5" aria-hidden>
      {series.map((value, index) => (
        <div
          key={index}
          className={cn(
            "w-1.5 rounded-sm",
            SPARKLINE_BAR_CLASSES[index % SPARKLINE_BAR_CLASSES.length],
          )}
          style={{ height: `${10 + (value / peak) * 30}px` }}
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
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
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
      <p className="text-[13px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      {renderLink({
        href,
        className: "text-sm font-medium text-primary underline-offset-4 hover:underline",
        children: hrefLabel,
      })}
    </div>
  );
}

function OverviewPanel({
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
  return (
    <div className="rounded-2xl border border-border bg-card">
      {isLoading ? (
        <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-label={loadingLabel}>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <TypographyP className="px-5 py-6" size="small" tone="subtle">
          {errorMessage}
        </TypographyP>
      ) : isEmpty ? (
        <TypographyP className="px-5 py-6" size="small" tone="subtle">
          {emptyMessage}
        </TypographyP>
      ) : (
        children
      )}
    </div>
  );
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
  return (
    <div className="rounded-3xl border border-border bg-muted p-3">
      <TypographyP size="small" tone="subtle">
        {label}
      </TypographyP>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="font-heading text-3xl font-medium text-foreground">{value}</p>
          <TypographyP className="mt-1" size="small" tone="subtle">
            {detail}
          </TypographyP>
        </div>
        {series ? <Sparkline series={series} /> : null}
      </div>
    </div>
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

      <section
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        aria-busy={isLoading || undefined}
        aria-label={isLoading ? loadingLabel : undefined}
      >
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
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <OverviewSectionHeader
            label={intl.formatMessage(dashboardPageViewMessages.activityLabel)}
            href={jobsHref}
            hrefLabel={intl.formatMessage(dashboardPageViewMessages.viewJobs)}
            renderLink={renderLink}
          />
          <OverviewPanel
            isLoading={isLoading}
            isError={isError}
            isEmpty={overview.activity.length === 0}
            emptyMessage={intl.formatMessage(dashboardPageViewMessages.activityEmpty)}
            errorMessage={errorMessage}
            loadingLabel={loadingLabel}
          >
            <ul className="divide-y divide-border">
              {overview.activity.map((item) => (
                <OverviewActivityRow key={item.id} item={item} renderLink={renderLink} />
              ))}
            </ul>
          </OverviewPanel>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <OverviewSectionHeader
            label={intl.formatMessage(dashboardPageViewMessages.projectsLabel)}
            href={projectsHref}
            hrefLabel={intl.formatMessage(dashboardPageViewMessages.viewAll)}
            renderLink={renderLink}
          />
          <OverviewPanel
            isLoading={isLoading}
            isError={isError}
            isEmpty={overview.projects.length === 0}
            emptyMessage={intl.formatMessage(dashboardPageViewMessages.projectsEmpty)}
            errorMessage={errorMessage}
            loadingLabel={loadingLabel}
          >
            <ul className="divide-y divide-border">
              {overview.projects.map((project) => (
                <OverviewProjectRow
                  key={project.id}
                  organizationSlug={organizationSlug}
                  project={project}
                  renderLink={renderLink}
                />
              ))}
            </ul>
          </OverviewPanel>
        </div>
      </section>

      <section
        className={cn("grid gap-6", automationsEnabled ? "lg:grid-cols-2" : "lg:grid-cols-1")}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <OverviewSectionHeader
            label={intl.formatMessage(dashboardPageViewMessages.boardLabel)}
            href={issuesHref}
            hrefLabel={intl.formatMessage(dashboardPageViewMessages.viewBoard)}
            renderLink={renderLink}
          />
          <OverviewPanel
            isLoading={isLoading}
            isError={isError}
            isEmpty={overview.board.length === 0}
            emptyMessage={intl.formatMessage(dashboardPageViewMessages.boardEmpty)}
            errorMessage={errorMessage}
            loadingLabel={loadingLabel}
          >
            <ul className="divide-y divide-border">
              {overview.board.map((issue) => (
                <OverviewBoardRow key={issue.id} issue={issue} renderLink={renderLink} />
              ))}
            </ul>
          </OverviewPanel>
        </div>

        {automationsEnabled ? (
          <div className="flex min-w-0 flex-col gap-3">
            <OverviewSectionHeader
              label={intl.formatMessage(dashboardPageViewMessages.automationsLabel)}
              href={automationsHref}
              hrefLabel={intl.formatMessage(dashboardPageViewMessages.viewAutomations)}
              renderLink={renderLink}
            />
            <OverviewPanel
              isLoading={isLoading}
              isError={isError}
              isEmpty={overview.automations.length === 0}
              emptyMessage={intl.formatMessage(dashboardPageViewMessages.automationsEmpty)}
              errorMessage={errorMessage}
              loadingLabel={loadingLabel}
            >
              <ul className="divide-y divide-border">
                {overview.automations.map((run) => (
                  <OverviewAutomationRow key={run.id} run={run} renderLink={renderLink} />
                ))}
              </ul>
            </OverviewPanel>
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
    <div className="min-w-0 flex-1">
      <TypographyP className="truncate" size="small" weight="medium" tone="content">
        {item.title}
      </TypographyP>
      <TypographyP className="mt-0.5 truncate" size="small" tone="subtle">
        {item.subtitle}
      </TypographyP>
    </div>
  );

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {item.attention ? (
        <span className="size-2 shrink-0 rounded-full bg-red-500" aria-hidden />
      ) : null}
      {item.href
        ? renderLink({
            href: item.href,
            className: "flex min-w-0 flex-1 items-center gap-3",
            children: title,
          })
        : title}
      {item.attention && item.href ? (
        renderLink({
          href: item.href,
          className: "shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline",
          children: intl.formatMessage(dashboardPageViewMessages.openAction),
        })
      ) : (
        <StatusPill status={item.status} />
      )}
    </li>
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

  return (
    <li>
      {renderLink({
        href: project.href,
        className: "flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/40",
        onClick: () => {
          recordRecentProjectVisit(organizationSlug, project.id);
        },
        children: (
          <>
            <div className="min-w-0">
              <TypographyP className="truncate" size="small" weight="medium" tone="content">
                {project.name}
              </TypographyP>
              <TypographyP className="mt-0.5 truncate" size="small" tone="subtle">
                {[project.subtitle, project.localeRoute].filter(Boolean).join(" · ")}
              </TypographyP>
              {project.latestJobTitle ? (
                <TypographyP className="mt-1 truncate" size="small" tone="subtle">
                  {project.latestJobTitle}
                  {project.latestJobAt ? ` · ${formatRelativeTimestamp(project.latestJobAt)}` : ""}
                </TypographyP>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {intl.formatMessage(dashboardPageViewMessages.projectOpenCount, {
                  count: project.openCount,
                })}
              </span>
              {project.failedCount > 0 ? (
                <span className="text-xs font-medium text-red-700">
                  {intl.formatMessage(dashboardPageViewMessages.projectFailedCount, {
                    count: project.failedCount,
                  })}
                </span>
              ) : null}
            </div>
          </>
        ),
      })}
    </li>
  );
}

function OverviewBoardRow({
  issue,
  renderLink,
}: {
  issue: OverviewBoardItem;
  renderLink: DashboardLinkRenderer;
}) {
  return (
    <li>
      {renderLink({
        href: issue.href,
        className: "flex items-center gap-3 px-4 py-3 hover:bg-muted/40",
        children: (
          <>
            <IssuePriorityIcon priority={issue.priority} size="sm" />
            <div className="min-w-0 flex-1">
              <TypographyP className="truncate" size="small" weight="medium" tone="content">
                {issue.identifier} {issue.title}
              </TypographyP>
              <TypographyP className="mt-0.5 truncate" size="small" tone="subtle">
                {[issue.projectName, issue.locale].filter(Boolean).join(" · ")}
              </TypographyP>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatCompactRelativeTimestamp(issue.updatedAt)}
            </span>
          </>
        ),
      })}
    </li>
  );
}

function OverviewAutomationRow({
  run,
  renderLink,
}: {
  run: OverviewAutomationItem;
  renderLink: DashboardLinkRenderer;
}) {
  const intl = useIntl();

  return (
    <li>
      {renderLink({
        href: run.href,
        className: "flex items-center gap-3 px-4 py-3 hover:bg-muted/40",
        children: (
          <>
            <div className="min-w-0 flex-1">
              <TypographyP className="truncate" size="small" weight="medium" tone="content">
                {run.name}
              </TypographyP>
              <TypographyP className="mt-0.5 truncate" size="small" tone="subtle">
                {formatTriggerSource(run.triggerSource, intl)}
                {` · ${formatCompactRelativeTimestamp(run.updatedAt)}`}
              </TypographyP>
            </div>
            <StatusPill status={run.status} />
          </>
        ),
      })}
    </li>
  );
}
