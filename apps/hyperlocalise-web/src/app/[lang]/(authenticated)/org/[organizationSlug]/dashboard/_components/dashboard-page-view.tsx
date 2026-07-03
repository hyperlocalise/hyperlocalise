"use client";

import Link from "next/link";
import {
  AlertCircleIcon,
  ArrowRight01Icon,
  Chat01Icon,
  CheckmarkCircle02Icon,
  DashboardSquare01Icon,
  FolderKanbanIcon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

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

import type {
  DashboardAutomationRunItem,
  DashboardHeroState,
  DashboardIntegrationItem,
  DashboardJobItem,
  DashboardProjectItem,
} from "./dashboard-page-view-model";

export type DashboardLinkRenderer = (props: {
  href: string;
  className?: string;
  children: ReactNode;
}) => ReactNode;

function defaultRenderLink({ href, className, children }: Parameters<DashboardLinkRenderer>[0]) {
  return (
    <Link href={href} className={className}>
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
  emptyMessage?: string;
  isEmpty?: boolean;
  children: ReactNode;
  renderLink?: DashboardLinkRenderer;
}) {
  return (
    <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
      <CardHeader className="px-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg text-foreground">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <HugeiconsIcon icon={icon} strokeWidth={1.8} className="mt-1 size-5 text-foreground/42" />
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {isLoading ? (
          <div
            className="grid gap-2"
            aria-busy="true"
            aria-label={`Loading ${title.toLowerCase()}`}
          >
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-lg bg-muted" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-start gap-3 rounded-lg border border-flame-700/20 bg-flame-700/10 px-4 py-4">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              strokeWidth={1.8}
              className="mt-0.5 size-5 text-flame-100"
            />
            <TypographyP className="text-sm text-muted-foreground">
              {errorMessage ?? `${title} could not be loaded.`}
            </TypographyP>
          </div>
        ) : (
          <>
            {isEmpty && emptyMessage ? (
              <TypographyP className="rounded-lg border border-dashed border-foreground/10 px-3 py-4 text-sm text-muted-foreground">
                {emptyMessage}
              </TypographyP>
            ) : (
              <div className="grid gap-2">{children}</div>
            )}
          </>
        )}

        {renderLink({
          href: footerHref,
          className:
            "mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground",
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
  const progressValue = Math.round((hero.connectedCount / hero.totalCount) * 100);

  return (
    <Card className="rounded-2xl border border-foreground/8 bg-gradient-to-br from-beam-700/20 via-foreground/4 to-foreground/2 py-0 text-foreground ring-0 lg:col-span-2">
      <CardContent className="flex h-full flex-col justify-between gap-6 px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] lg:items-end">
          <div>
            <TypographyP className="text-sm font-medium text-foreground/72">
              Workspace setup · {hero.connectedCount} of {hero.totalCount} connected
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
      <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 ring-0">
        <CardContent className="px-5 py-5">
          {isLoading ? (
            <div className="grid gap-2" aria-busy="true" aria-label="Loading integrations">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-lg bg-muted" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2">
              {integrations.map((item) => (
                <div key={item.id}>
                  {renderLink({
                    href: integrationsHref,
                    className:
                      "block rounded-lg border border-foreground/8 px-4 py-4 transition-colors hover:bg-foreground/4",
                    children: (
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <TypographyP className="text-sm font-medium text-foreground">
                            {item.label}
                          </TypographyP>
                          <TypographyP className="mt-1 text-sm text-muted-foreground">
                            {item.description}
                          </TypographyP>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 rounded-full",
                            item.connected
                              ? "border-grove-300/25 bg-grove-300/10 text-grove-300"
                              : "border-foreground/12 bg-foreground/4 text-muted-foreground",
                          )}
                        >
                          {item.connected ? "Connected" : "Connect"}
                        </Badge>
                      </div>
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

      <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 ring-0">
        <CardContent className="px-5 py-5">
          {isLoading ? (
            <div className="grid gap-3" aria-busy="true" aria-label="Loading automation runs">
              <Skeleton className="h-4 w-48 rounded-full bg-muted" />
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-14 rounded-lg bg-muted" />
              ))}
            </div>
          ) : isError ? (
            <TypographyP className="text-sm text-muted-foreground">
              Automation runs could not be loaded.
            </TypographyP>
          ) : (
            <>
              <TypographyP className="text-sm text-muted-foreground">
                {stats.total} automations · {stats.active} active · {stats.paused} paused
              </TypographyP>
              <div className="mt-4 grid gap-2">
                {runs.length === 0 ? (
                  <TypographyP className="rounded-lg border border-dashed border-foreground/10 px-3 py-4 text-sm text-muted-foreground">
                    No automation runs yet.
                  </TypographyP>
                ) : (
                  runs.map((run) => (
                    <div key={run.id}>
                      {renderLink({
                        href: run.href,
                        className:
                          "block rounded-lg border border-foreground/8 px-4 py-3 transition-colors hover:bg-foreground/4",
                        children: (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <TypographyP className="min-w-0 truncate text-sm font-medium text-foreground">
                                {run.automationName}
                              </TypographyP>
                              <Badge variant="outline" className="rounded-full capitalize">
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
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function DashboardPageView({
  organizationSlug,
  hero,
  integrations,
  jobs,
  projects,
  automationStats,
  automationRuns,
  automationsEnabled = false,
  isIntegrationsLoading = false,
  isJobsLoading = false,
  isJobsError = false,
  isProjectsLoading = false,
  isProjectsError = false,
  isAutomationsLoading = false,
  isAutomationsError = false,
  renderLink = defaultRenderLink,
}: {
  organizationSlug: string;
  hero: DashboardHeroState;
  integrations: DashboardIntegrationItem[];
  jobs: DashboardJobItem[];
  projects: DashboardProjectItem[];
  automationStats: { total: number; active: number; paused: number };
  automationRuns: DashboardAutomationRunItem[];
  automationsEnabled?: boolean;
  isIntegrationsLoading?: boolean;
  isJobsLoading?: boolean;
  isJobsError?: boolean;
  isProjectsLoading?: boolean;
  isProjectsError?: boolean;
  isAutomationsLoading?: boolean;
  isAutomationsError?: boolean;
  renderLink?: DashboardLinkRenderer;
}) {
  const integrationsHref = `/org/${organizationSlug}/integrations`;
  const myJobsHref = `/org/${organizationSlug}/my-jobs`;
  const projectsHref = `/org/${organizationSlug}/projects`;
  const newRequestHref = `/org/${organizationSlug}/chat`;

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={DashboardSquare01Icon}
        label="Workspace"
        title="Overview"
        description="Your workspace at a glance — setup, assigned work, and recent projects."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {hero.mode === "setup" ? (
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
            <Card className="rounded-2xl border border-foreground/8 bg-foreground/2 py-0 ring-0">
              <CardContent className="flex h-full flex-col justify-between gap-4 px-6 py-6">
                <div>
                  <TypographyP className="text-sm font-medium text-foreground/72">
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

      <section className="grid gap-4 lg:grid-cols-2">
        <DashboardPanel
          title="My jobs"
          description="The latest work assigned to you, prioritized by what needs action."
          icon={TaskDone01Icon}
          footerHref={myJobsHref}
          footerLabel="View all jobs"
          isLoading={isJobsLoading}
          isError={isJobsError}
          isEmpty={jobs.length === 0}
          emptyMessage="No jobs assigned to you yet."
          renderLink={renderLink}
        >
          {jobs.map((job) => {
            const content = (
              <div className="rounded-lg border border-foreground/8 px-3 py-3 transition-colors hover:bg-foreground/4">
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
              </div>
            );

            if (!job.href) {
              return <div key={job.id}>{content}</div>;
            }

            return (
              <div key={job.id}>
                {renderLink({
                  href: job.href,
                  className: "block",
                  children: content,
                })}
              </div>
            );
          })}
        </DashboardPanel>

        <DashboardPanel
          title="Recent projects"
          description="Projects with the most open work, plus your latest activity."
          icon={FolderKanbanIcon}
          footerHref={projectsHref}
          footerLabel="View all projects"
          isLoading={isProjectsLoading}
          isError={isProjectsError}
          isEmpty={projects.length === 0}
          emptyMessage="No projects yet. Connect a TMS or create a native project to get started."
          renderLink={renderLink}
        >
          {projects.map((project) => (
            <div key={project.id}>
              {renderLink({
                href: project.href,
                className:
                  "block rounded-lg border border-foreground/8 px-3 py-3 transition-colors hover:bg-foreground/4",
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
