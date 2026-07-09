"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertCircleIcon,
  ArrowRight01Icon,
  Chat01Icon,
  CheckmarkCircle02Icon,
  DashboardSquare01Icon,
  FolderKanbanIcon,
  SlackIcon,
  TaskDone01Icon,
  TranslationIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps, ReactNode } from "react";
import { siGithub } from "simple-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { OverviewHeroCard } from "../../_components/overview/overview-hero-card";
import { OverviewSectionHeader } from "../../_components/overview/overview-section-header";
import { formatRelativeTimestamp } from "../../_components/workspace-files-shared";
import {
  PageHeader,
  WorkspacePageShell,
  toneClass,
} from "../../_components/workspace-resource-shared";
import { formatJobStatusLabel, jobTone } from "../../jobs/_components/jobs-page-view";
import { formatPendingActionCount } from "../../_components/overview/overview-attention";
import { SimpleBrandIcon } from "../../integrations/_components/simple-brand-icon";
import { recordRecentProjectVisit } from "../../projects/_components/recent-projects";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";

import type {
  DashboardAutomationRunItem,
  DashboardHeroState,
  DashboardIntegrationItem,
  DashboardJobItem,
  DashboardProjectItem,
} from "./dashboard-page-view-model";

type AutomationRunStatus = DashboardAutomationRunItem["status"];
type AutomationRunBadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

const AUTOMATION_RUN_BADGE_VARIANTS: Record<AutomationRunStatus, AutomationRunBadgeVariant> = {
  queued: "warning",
  running: "warning",
  succeeded: "success",
  failed: "destructive",
  cancelled: "warning",
  skipped: "warning",
};

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

function DashboardPanel({
  title,
  description,
  icon,
  footerHref,
  footerLabel,
  isLoading,
  isError,
  errorMessage,
  warningMessage,
  emptyMessage,
  isEmpty = false,
  children,
  renderLink = defaultRenderLink,
}: {
  title: string;
  description: string;
  icon: typeof TaskDone01Icon;
  footerHref: string;
  footerLabel: string;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  warningMessage?: string;
  emptyMessage?: string;
  isEmpty?: boolean;
  children: ReactNode;
  renderLink?: DashboardLinkRenderer;
}) {
  return (
    <Card className="rounded-lg border border-border bg-card py-0 text-foreground ring-0">
      <CardHeader className="border-b border-border px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg text-foreground">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <HugeiconsIcon
            icon={icon}
            strokeWidth={1.8}
            className="mt-1 size-5 text-muted-foreground"
          />
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {isLoading ? (
          <div
            className="flex flex-col divide-y divide-border"
            aria-busy="true"
            aria-label={`Loading ${title.toLowerCase()}`}
          >
            {Array.from({ length: 3 }).map((_, index) => (
              <DashboardPanelCardSkeleton key={index} />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-start gap-3 px-5 py-4">
            <div className="flex flex-1 items-start gap-3 rounded-lg border border-flame-700/20 bg-flame-700/10 px-4 py-4">
              <HugeiconsIcon
                icon={AlertCircleIcon}
                strokeWidth={1.8}
                className="mt-0.5 size-5 text-flame-100"
              />
              <TypographyP className="text-sm text-muted-foreground">
                {errorMessage ?? `${title} could not be loaded.`}
              </TypographyP>
            </div>
          </div>
        ) : (
          <>
            {isEmpty && emptyMessage ? (
              <TypographyP className="px-5 py-4 text-sm text-muted-foreground">
                {emptyMessage}
              </TypographyP>
            ) : (
              <div className="flex flex-col divide-y divide-border">{children}</div>
            )}
            {warningMessage ? (
              <div className="border-t border-border px-5 py-3">
                <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-3">
                  <HugeiconsIcon
                    icon={AlertCircleIcon}
                    strokeWidth={1.8}
                    className="mt-0.5 size-4 text-warning"
                  />
                  <TypographyP className="text-sm text-warning-foreground">
                    {warningMessage}
                  </TypographyP>
                </div>
              </div>
            ) : null}
          </>
        )}

        {renderLink({
          href: footerHref,
          className:
            "flex items-center gap-2 border-t border-border px-5 py-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          children: (
            <>
              <span>{footerLabel}</span>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
            </>
          ),
        })}
      </CardContent>
    </Card>
  );
}

function DashboardSetupHero({
  hero,
  newRequestHref,
  renderLink = defaultRenderLink,
}: {
  hero: Extract<DashboardHeroState, { mode: "setup" }>;
  newRequestHref: string;
  renderLink?: DashboardLinkRenderer;
}) {
  const progressValue = Math.round((hero.completedCount / hero.totalCount) * 100);

  return (
    <Card className="rounded-2xl border border-border bg-gradient-to-br from-amber-100 via-muted to-muted py-0 text-foreground ring-0 lg:col-span-2">
      <CardContent className="flex h-full flex-col justify-between gap-6 px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] lg:items-end">
          <div>
            <TypographyP className="text-sm font-medium text-subtle-foreground">
              Workspace setup · {hero.completedCount} of {hero.totalCount} complete
            </TypographyP>
            <TypographyP className="mt-2 font-heading text-2xl font-medium text-foreground">
              {hero.title}
            </TypographyP>
            <TypographyP className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              {hero.description}
            </TypographyP>
            <div className="mt-5 flex flex-wrap gap-2">
              {renderLink({
                href: hero.ctaHref,
                children: (
                  <Button className="rounded-full">
                    {hero.ctaLabel}
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} />
                  </Button>
                ),
              })}
              {renderLink({
                href: newRequestHref,
                children: (
                  <Button variant="outline" className="rounded-full">
                    <HugeiconsIcon icon={Chat01Icon} strokeWidth={1.8} />
                    New request
                  </Button>
                ),
              })}
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Setup progress</span>
              <span>{progressValue}%</span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardHeroSkeleton() {
  return (
    <>
      <Card
        className="rounded-2xl border border-border bg-card py-0 ring-0"
        aria-busy="true"
        aria-label="Loading workspace overview"
      >
        <CardContent className="flex h-full min-h-52 flex-col justify-between gap-6 px-6 py-6">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-4 w-4/5 max-w-lg" />
            <Skeleton className="mt-2 h-9 w-32 rounded-full" />
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border border-border bg-muted py-0 ring-0" aria-hidden>
        <CardContent className="flex h-full min-h-52 flex-col justify-between gap-4 px-6 py-6">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-56 max-w-full" />
            <Skeleton className="h-4 w-full max-w-sm" />
            <Skeleton className="h-4 w-4/5 max-w-xs" />
          </div>
          <Skeleton className="h-9 w-32 rounded-full" />
        </CardContent>
      </Card>
    </>
  );
}

function DashboardPanelCardSkeleton() {
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-2 h-3 w-full max-w-xs" />
    </div>
  );
}

function DashboardIntegrationMark({ item }: { item: DashboardIntegrationItem }) {
  if (item.id === "github") {
    return <SimpleBrandIcon icon={siGithub} colored={item.connected} />;
  }

  if (item.id === "slack") {
    return <HugeiconsIcon icon={SlackIcon} strokeWidth={1.8} className="size-5" />;
  }

  if (item.providerKind) {
    const branding = getTmsProviderBranding(item.providerKind);
    if (branding.icon) {
      return <SimpleBrandIcon icon={branding.icon} colored={item.connected} />;
    }

    return (
      <Image src={branding.logo} alt="" width={24} height={24} className="size-6 object-contain" />
    );
  }

  return <HugeiconsIcon icon={TranslationIcon} strokeWidth={1.8} className="size-5" />;
}

function DashboardIntegrationsSection({
  integrations,
  integrationsHref,
  isLoading,
  renderLink = defaultRenderLink,
}: {
  integrations: DashboardIntegrationItem[];
  integrationsHref: string;
  isLoading?: boolean;
  renderLink?: DashboardLinkRenderer;
}) {
  const connectedCount = integrations.filter((item) => item.connected).length;

  return (
    <section className="flex flex-col gap-4">
      <OverviewSectionHeader title="Integrations" count={integrations.length - connectedCount} />
      <Card className="overflow-hidden rounded-lg border border-border bg-card py-0 ring-0">
        <CardContent className="p-0">
          {isLoading ? (
            <div
              className="flex flex-col divide-y divide-border"
              aria-busy="true"
              aria-label="Loading integrations"
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4 px-5 py-4">
                  <Skeleton className="size-10 shrink-0 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {integrations.map((item) => (
                <div key={item.id}>
                  {renderLink({
                    href: integrationsHref,
                    className:
                      "group grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[auto_minmax(0,1fr)_auto]",
                    children: (
                      <>
                        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground group-hover:text-foreground">
                          <DashboardIntegrationMark item={item} />
                        </div>
                        <div className="min-w-0">
                          <TypographyP className="text-sm font-medium text-foreground">
                            {item.label}
                          </TypographyP>
                          <TypographyP className="mt-1 text-sm text-subtle-foreground">
                            {item.description}
                          </TypographyP>
                        </div>
                        <div className="col-span-2 flex items-center justify-between gap-3 pl-14 sm:col-span-1 sm:pl-0">
                          <Badge variant={item.connected ? "success" : "outline"}>
                            {item.connected ? (
                              <HugeiconsIcon
                                icon={CheckmarkCircle02Icon}
                                strokeWidth={2}
                                data-icon="inline-start"
                              />
                            ) : null}
                            {item.connected ? "Connected" : "Not connected"}
                          </Badge>
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                            {item.connected ? "Manage" : "Connect"}
                            <HugeiconsIcon
                              icon={ArrowRight01Icon}
                              strokeWidth={1.8}
                              className="size-4"
                            />
                          </span>
                        </div>
                      </>
                    ),
                  })}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function DashboardAutomationsSection({
  organizationSlug,
  stats,
  runs,
  isLoading,
  isError,
  renderLink = defaultRenderLink,
}: {
  organizationSlug: string;
  stats: { total: number; active: number; paused: number };
  runs: DashboardAutomationRunItem[];
  isLoading?: boolean;
  isError?: boolean;
  renderLink?: DashboardLinkRenderer;
}) {
  const automationsHref = `/org/${organizationSlug}/automations`;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <OverviewSectionHeader title="Automation runs" />
        {renderLink({
          href: automationsHref,
          children: (
            <Button variant="outline" size="sm" className="rounded-full">
              View automations
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
            </Button>
          ),
        })}
      </div>

      <Card className="overflow-hidden rounded-lg border border-border bg-card py-0 ring-0">
        <CardContent className="p-0">
          {isLoading ? (
            <div
              className="flex flex-col divide-y divide-border"
              aria-busy="true"
              aria-label="Loading automation runs"
            >
              <div className="px-5 py-4">
                <Skeleton className="h-4 w-48" />
              </div>
              {Array.from({ length: 3 }).map((_, index) => (
                <DashboardPanelCardSkeleton key={index} />
              ))}
            </div>
          ) : isError ? (
            <div className="flex items-start gap-3 px-5 py-4">
              <div className="flex flex-1 items-start gap-3 rounded-lg border border-flame-700/20 bg-flame-700/10 px-4 py-4">
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  strokeWidth={1.8}
                  className="mt-0.5 size-5 text-flame-100"
                />
                <TypographyP className="text-sm text-muted-foreground">
                  Automation runs could not be loaded.
                </TypographyP>
              </div>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              <TypographyP className="px-5 py-4 text-sm text-muted-foreground">
                {stats.total} automations · {stats.active} active · {stats.paused} paused
              </TypographyP>
              {runs.length === 0 ? (
                <TypographyP className="px-5 py-4 text-sm text-muted-foreground">
                  No automation runs yet.
                </TypographyP>
              ) : (
                runs.map((run) => (
                  <div key={run.id}>
                    {renderLink({
                      href: run.href,
                      className:
                        "block px-5 py-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      children: (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <TypographyP className="min-w-0 truncate text-sm font-medium text-foreground">
                              {run.automationName}
                            </TypographyP>
                            <Badge
                              variant={AUTOMATION_RUN_BADGE_VARIANTS[run.status]}
                              className="rounded-full capitalize"
                            >
                              {run.status}
                            </Badge>
                          </div>
                          <TypographyP className="mt-1 text-xs text-muted-foreground">
                            {run.triggerSource}
                            {run.completedAt
                              ? ` · completed ${formatRelativeTimestamp(run.completedAt)}`
                              : " · in progress"}
                          </TypographyP>
                        </>
                      ),
                    })}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function DashboardJobsPanel({
  title,
  description,
  jobs,
  footerHref,
  isLoading,
  isError,
  warningMessage,
  emptyMessage,
  renderLink,
}: {
  title: string;
  description: string;
  jobs: DashboardJobItem[];
  footerHref: string;
  isLoading: boolean;
  isError: boolean;
  warningMessage?: string;
  emptyMessage: string;
  renderLink: DashboardLinkRenderer;
}) {
  return (
    <DashboardPanel
      title={title}
      description={description}
      icon={TaskDone01Icon}
      footerHref={footerHref}
      footerLabel="View all jobs"
      isLoading={isLoading}
      isError={isError}
      warningMessage={warningMessage}
      isEmpty={jobs.length === 0}
      emptyMessage={emptyMessage}
      renderLink={renderLink}
    >
      {jobs.map((job) => {
        const content = (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <TypographyP className="min-w-0 truncate text-sm font-medium text-foreground">
                {job.name}
              </TypographyP>
              <Badge
                variant="outline"
                className={cn("rounded-full capitalize", toneClass(jobTone(job.status)))}
              >
                {formatJobStatusLabel(job.status)}
              </Badge>
            </div>
            <TypographyP className="mt-1 text-xs text-muted-foreground">
              {job.projectName ?? "Workspace"} · {job.kindLabel} · updated{" "}
              {formatRelativeTimestamp(job.updatedAt)}
            </TypographyP>
          </>
        );

        if (!job.href) {
          return (
            <div key={job.id} className="px-5 py-4">
              {content}
            </div>
          );
        }

        return (
          <div key={job.id}>
            {renderLink({
              href: job.href,
              className:
                "block px-5 py-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              children: content,
            })}
          </div>
        );
      })}
    </DashboardPanel>
  );
}

function DashboardProjectsPanel({
  organizationSlug,
  title,
  description,
  projects,
  footerHref,
  isLoading,
  isError,
  emptyMessage,
  renderLink,
}: {
  organizationSlug: string;
  title: string;
  description: string;
  projects: DashboardProjectItem[];
  footerHref: string;
  isLoading: boolean;
  isError: boolean;
  emptyMessage: string;
  renderLink: DashboardLinkRenderer;
}) {
  return (
    <DashboardPanel
      title={title}
      description={description}
      icon={FolderKanbanIcon}
      footerHref={footerHref}
      footerLabel="View all projects"
      isLoading={isLoading}
      isError={isError}
      isEmpty={projects.length === 0}
      emptyMessage={emptyMessage}
      renderLink={renderLink}
    >
      {projects.map((project) => (
        <div key={project.id}>
          {renderLink({
            href: project.href,
            className:
              "block px-5 py-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            onClick: () => {
              recordRecentProjectVisit(organizationSlug, project.id);
            },
            children: (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <TypographyP className="min-w-0 truncate text-sm font-medium text-foreground">
                    {project.name}
                  </TypographyP>
                  {project.pendingActionCount > 0 ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-beam-500/30 bg-beam-500/15 text-beam-100"
                    >
                      {formatPendingActionCount(project.pendingActionCount)} open
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full text-muted-foreground">
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        strokeWidth={1.7}
                        className="mr-1 size-3.5"
                      />
                      Up to date
                    </Badge>
                  )}
                </div>
                <TypographyP className="mt-1 text-xs text-muted-foreground">
                  {project.sourceLabel} · {project.localeRoute}
                  {project.updatedAt
                    ? ` · updated ${formatRelativeTimestamp(project.updatedAt)}`
                    : ""}
                </TypographyP>
              </>
            ),
          })}
        </div>
      ))}
    </DashboardPanel>
  );
}

export function DashboardPageView({
  organizationSlug,
  hero,
  isHeroLoading = false,
  integrations,
  jobs,
  latestJobs,
  projects,
  showTmsSections = false,
  tmsProviderName = "TMS",
  tmsJobs,
  tmsProjects,
  automationStats,
  automationRuns,
  automationsEnabled = false,
  isIntegrationsLoading = false,
  isJobsLoading = false,
  isJobsError = false,
  jobsWarning,
  isLatestJobsLoading = false,
  isLatestJobsError = false,
  isProjectsLoading = false,
  isProjectsError = false,
  isTmsJobsLoading = false,
  isTmsJobsError = false,
  isTmsProjectsLoading = false,
  isTmsProjectsError = false,
  isAutomationsLoading = false,
  isAutomationsError = false,
  renderLink = defaultRenderLink,
}: {
  organizationSlug: string;
  hero: DashboardHeroState;
  isHeroLoading?: boolean;
  integrations: DashboardIntegrationItem[];
  jobs: DashboardJobItem[];
  latestJobs: DashboardJobItem[];
  projects: DashboardProjectItem[];
  showTmsSections?: boolean;
  tmsProviderName?: string;
  tmsJobs: DashboardJobItem[];
  tmsProjects: DashboardProjectItem[];
  automationStats: { total: number; active: number; paused: number };
  automationRuns: DashboardAutomationRunItem[];
  automationsEnabled?: boolean;
  isIntegrationsLoading?: boolean;
  isJobsLoading?: boolean;
  isJobsError?: boolean;
  jobsWarning?: string;
  isLatestJobsLoading?: boolean;
  isLatestJobsError?: boolean;
  isProjectsLoading?: boolean;
  isProjectsError?: boolean;
  isTmsJobsLoading?: boolean;
  isTmsJobsError?: boolean;
  isTmsProjectsLoading?: boolean;
  isTmsProjectsError?: boolean;
  isAutomationsLoading?: boolean;
  isAutomationsError?: boolean;
  renderLink?: DashboardLinkRenderer;
}) {
  const integrationsHref = `/org/${organizationSlug}/integrations`;
  const myJobsHref = `/org/${organizationSlug}/my-jobs`;
  const jobsHref = `/org/${organizationSlug}/jobs`;
  const projectsHref = `/org/${organizationSlug}/projects`;
  const newRequestHref = `/org/${organizationSlug}/chat`;

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={DashboardSquare01Icon}
        label="Workspace"
        title="Overview"
        description="Your workspace at a glance — assigned work, latest activity, and recent projects."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {isHeroLoading ? (
          <DashboardHeroSkeleton />
        ) : hero.mode === "setup" ? (
          <DashboardSetupHero hero={hero} newRequestHref={newRequestHref} renderLink={renderLink} />
        ) : (
          <>
            <OverviewHeroCard
              pendingCount={hero.pendingCount}
              title={hero.title}
              description={hero.description}
              ctaLabel={hero.ctaLabel}
              ctaHref={hero.ctaHref}
            />
            <Card className="rounded-2xl border border-border bg-muted py-0 ring-0">
              <CardContent className="flex h-full flex-col justify-between gap-4 px-6 py-6">
                <div>
                  <TypographyP className="text-sm font-medium text-subtle-foreground">
                    Quick start
                  </TypographyP>
                  <TypographyP className="mt-2 font-heading text-xl font-medium text-foreground">
                    Ask the localization agent
                  </TypographyP>
                  <TypographyP className="mt-2 text-sm leading-6 text-muted-foreground">
                    Describe what you need translated, researched, or reviewed and Hyperlocalise
                    will prepare the work.
                  </TypographyP>
                </div>
                {renderLink({
                  href: newRequestHref,
                  children: (
                    <Button className="w-fit rounded-full">
                      <HugeiconsIcon icon={Chat01Icon} strokeWidth={1.8} />
                      New request
                    </Button>
                  ),
                })}
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <DashboardJobsPanel
          title="My jobs"
          description="The latest work assigned to you, prioritized by what needs action."
          jobs={jobs}
          footerHref={myJobsHref}
          isLoading={isJobsLoading}
          isError={isJobsError}
          warningMessage={jobsWarning}
          emptyMessage="No jobs assigned to you yet."
          renderLink={renderLink}
        />

        <DashboardJobsPanel
          title="Latest jobs"
          description="The most recently updated work across this workspace."
          jobs={latestJobs}
          footerHref={jobsHref}
          isLoading={isLatestJobsLoading}
          isError={isLatestJobsError}
          emptyMessage="No workspace jobs yet."
          renderLink={renderLink}
        />

        <DashboardProjectsPanel
          organizationSlug={organizationSlug}
          title="Recent projects"
          description="Projects you opened recently, followed by active workspace projects."
          projects={projects}
          footerHref={projectsHref}
          isLoading={isProjectsLoading}
          isError={isProjectsError}
          emptyMessage="No native projects yet. Create a project to get started."
          renderLink={renderLink}
        />

        {showTmsSections ? (
          <>
            <DashboardJobsPanel
              title={`${tmsProviderName} jobs`}
              description={`Live jobs fetched from ${tmsProviderName}.`}
              jobs={tmsJobs}
              footerHref={jobsHref}
              isLoading={isTmsJobsLoading}
              isError={isTmsJobsError}
              emptyMessage={`No jobs found in ${tmsProviderName}.`}
              renderLink={renderLink}
            />
            <DashboardProjectsPanel
              organizationSlug={organizationSlug}
              title={`${tmsProviderName} projects`}
              description={`Live projects fetched from ${tmsProviderName}.`}
              projects={tmsProjects}
              footerHref={projectsHref}
              isLoading={isTmsProjectsLoading}
              isError={isTmsProjectsError}
              emptyMessage={`No projects found in ${tmsProviderName}.`}
              renderLink={renderLink}
            />
          </>
        ) : null}
      </section>

      <DashboardIntegrationsSection
        integrations={integrations}
        integrationsHref={integrationsHref}
        isLoading={isIntegrationsLoading}
        renderLink={renderLink}
      />

      {automationsEnabled ? (
        <DashboardAutomationsSection
          organizationSlug={organizationSlug}
          stats={automationStats}
          runs={automationRuns}
          isLoading={isAutomationsLoading}
          isError={isAutomationsError}
          renderLink={renderLink}
        />
      ) : null}
    </WorkspacePageShell>
  );
}
