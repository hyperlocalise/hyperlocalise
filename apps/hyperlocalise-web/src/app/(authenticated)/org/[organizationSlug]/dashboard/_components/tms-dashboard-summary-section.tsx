"use client";

import Link from "next/link";
import {
  AlertCircleIcon,
  ArrowRight01Icon,
  BookOpenTextIcon,
  DatabaseSyncIcon,
  File01Icon,
  FolderKanbanIcon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TypographyP } from "@/components/ui/typography";
import { createApiClient } from "@/lib/api-client";
import {
  FAILED_SYNC_RUNS_RECENCY_DAYS,
  type OrganizationTmsDashboardSummary,
} from "@/lib/providers/organization-tms-dashboard-summary.types";
import { cn } from "@/lib/primitives/cn";

import { buildOrgWorkspaceHref } from "../../_components/workspace-filter-params";
import { formatRelativeTimestamp, providerLabel } from "../../_components/workspace-files-shared";

const api = createApiClient();

type Tone = "safe" | "watch" | "risk" | "info";

function toneClass(tone: Tone) {
  switch (tone) {
    case "safe":
      return "border-grove-300/25 bg-grove-300/10 text-grove-300";
    case "watch":
      return "border-bud-500/25 bg-bud-500/10 text-bud-300";
    case "risk":
      return "border-flame-700/25 bg-flame-700/10 text-flame-100";
    default:
      return "border-dew-500/25 bg-dew-500/10 text-dew-100";
  }
}

function localeStatusTone(row: OrganizationTmsDashboardSummary["localeReadiness"][number]): Tone {
  if (row.missing > 0) return "risk";
  if (row.changed > 0) return "watch";
  return "safe";
}

function localeStatusLabel(row: OrganizationTmsDashboardSummary["localeReadiness"][number]) {
  if (row.missing > 0) return "Needs attention";
  if (row.changed > 0) return "Changed";
  return "Ready";
}

function SummaryMetricCard({
  label,
  value,
  detail,
  tone,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-foreground/8 bg-foreground/2.5 px-4 py-4 transition hover:border-foreground/16 hover:bg-foreground/4"
    >
      <TypographyP className="text-sm text-foreground/52">{label}</TypographyP>
      <TypographyP className="mt-2 font-heading text-3xl font-medium text-foreground">
        {value}
      </TypographyP>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge variant="outline" className={cn("rounded-full text-[0.7rem]", toneClass(tone))}>
          {detail}
        </Badge>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={1.7}
          className="size-4 text-foreground/38 transition group-hover:text-foreground/64"
        />
      </div>
    </Link>
  );
}

export function TmsDashboardSummarySection({ organizationSlug }: { organizationSlug: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tms-dashboard-summary", organizationSlug],
    queryFn: async () => {
      const res = await api.api.orgs[":organizationSlug"]["tms-dashboard-summary"].$get({
        param: { organizationSlug },
      });
      if (!res.ok) throw new Error("Failed to fetch TMS dashboard summary");
      const body = await res.json();
      return body.tmsDashboardSummary as OrganizationTmsDashboardSummary;
    },
  });

  const connectedProviders = data?.counts.connectedProviders ?? 0;
  const staleTotal =
    (data?.counts.staleFiles ?? 0) +
    (data?.counts.staleGlossaries ?? 0) +
    (data?.counts.staleMemories ?? 0);
  const syncErrorGlossaries = data?.counts.syncErrorGlossaries ?? 0;
  const syncErrorMemories = data?.counts.syncErrorMemories ?? 0;
  const recentFailedSyncRunsHref = `/org/${organizationSlug}/dashboard#recent-failed-sync-runs`;

  return (
    <section className="flex flex-col gap-4">
      <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
        <CardHeader className="px-5 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl text-foreground">TMS sync overview</CardTitle>
              <CardDescription className="mt-1 text-foreground/48">
                Live provider connectivity, sync health, and locale readiness from your workspace
                database.
              </CardDescription>
            </div>
            <HugeiconsIcon
              icon={DatabaseSyncIcon}
              strokeWidth={1.8}
              className="mt-1 size-5 text-foreground/42"
            />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {isLoading ? (
            <TypographyP className="py-4 text-sm text-foreground/52">
              Loading TMS sync summary…
            </TypographyP>
          ) : isError ? (
            <div className="flex items-start gap-3 rounded-lg border border-flame-700/20 bg-flame-700/10 px-4 py-4">
              <HugeiconsIcon
                icon={AlertCircleIcon}
                strokeWidth={1.8}
                className="mt-0.5 size-5 text-flame-100"
              />
              <div>
                <TypographyP className="text-sm font-medium text-foreground">
                  Unable to load TMS summary
                </TypographyP>
                <TypographyP className="mt-1 text-sm text-foreground/52">
                  Refresh the page or try again in a moment.
                </TypographyP>
              </div>
            </div>
          ) : connectedProviders === 0 ? (
            <div className="py-2">
              <TypographyP className="text-sm text-foreground/52">
                No external TMS providers connected yet. Connect a provider to sync projects, files,
                jobs, glossaries, and translation memories into this workspace.
              </TypographyP>
              <Link
                href={buildOrgWorkspaceHref(organizationSlug, "integrations")}
                className="mt-3 inline-flex items-center gap-2 text-sm text-foreground/54 hover:text-foreground"
              >
                <span>Connect a provider in Integrations</span>
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SummaryMetricCard
                label="Connected providers"
                value={String(data?.counts.connectedProviders ?? 0)}
                detail="validated integrations"
                tone="safe"
                href={buildOrgWorkspaceHref(organizationSlug, "integrations")}
              />
              <SummaryMetricCard
                label="Synced projects"
                value={String(data?.counts.externalProjects ?? 0)}
                detail="external TMS projects"
                tone="info"
                href={buildOrgWorkspaceHref(organizationSlug, "projects", {
                  source: "external_tms",
                })}
              />
              <SummaryMetricCard
                label="Stale syncs"
                value={String(staleTotal)}
                detail="files, glossaries, TMs"
                tone={staleTotal > 0 ? "watch" : "safe"}
                href={buildOrgWorkspaceHref(organizationSlug, "files", { sync: "stale" })}
              />
              <SummaryMetricCard
                label="Open provider jobs"
                value={String(data?.counts.openProviderJobs ?? 0)}
                detail="queued or in progress"
                tone={(data?.counts.openProviderJobs ?? 0) > 0 ? "info" : "safe"}
                href={buildOrgWorkspaceHref(organizationSlug, "jobs", { source: "provider" })}
              />
              <SummaryMetricCard
                label="Failed sync runs"
                value={String(data?.counts.failedSyncRuns ?? 0)}
                detail={`last ${FAILED_SYNC_RUNS_RECENCY_DAYS} days`}
                tone={(data?.counts.failedSyncRuns ?? 0) > 0 ? "risk" : "safe"}
                href={recentFailedSyncRunsHref}
              />
              <SummaryMetricCard
                label="Glossary sync errors"
                value={String(syncErrorGlossaries)}
                detail="glossaries with sync failures"
                tone={syncErrorGlossaries > 0 ? "risk" : "safe"}
                href={buildOrgWorkspaceHref(organizationSlug, "glossaries", { sync: "error" })}
              />
              <SummaryMetricCard
                label="TM sync errors"
                value={String(syncErrorMemories)}
                detail="translation memories with sync failures"
                tone={syncErrorMemories > 0 ? "risk" : "safe"}
                href={buildOrgWorkspaceHref(organizationSlug, "translation-memories", {
                  sync: "error",
                })}
              />
              <SummaryMetricCard
                label="Pending job sync"
                value={String(data?.counts.pendingProviderJobSync ?? 0)}
                detail="provider jobs awaiting sync"
                tone={(data?.counts.pendingProviderJobSync ?? 0) > 0 ? "watch" : "safe"}
                href={buildOrgWorkspaceHref(organizationSlug, "jobs", { source: "provider" })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {data && connectedProviders > 0 ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="text-xl text-foreground">Connected providers</CardTitle>
                <CardDescription className="text-foreground/48">
                  Validation status, synced project counts, and last successful sync per provider.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-3">
                {data.providers.map((credential, index) => (
                  <div key={credential.id}>
                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <TypographyP className="text-sm font-medium text-foreground">
                            {credential.displayName}
                          </TypographyP>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full",
                              credential.validationStatus === "validated"
                                ? "border-grove-300/25 bg-grove-300/10 text-grove-300"
                                : "border-bud-500/25 bg-bud-500/10 text-bud-300",
                            )}
                          >
                            {credential.validationStatus === "validated"
                              ? "Validated"
                              : "Unvalidated"}
                          </Badge>
                        </div>
                        <TypographyP className="mt-1 text-xs text-foreground/42">
                          {providerLabel(credential.providerKind)} · {credential.projectCount}{" "}
                          projects
                          {credential.lastSuccessfulSyncAt
                            ? ` · last sync ${formatRelativeTimestamp(credential.lastSuccessfulSyncAt)}`
                            : ""}
                        </TypographyP>
                      </div>
                      <Link
                        href={buildOrgWorkspaceHref(organizationSlug, "projects", {
                          provider: credential.providerKind,
                          source: "external_tms",
                        })}
                        className="shrink-0 text-sm text-foreground/54 hover:text-foreground"
                      >
                        View projects
                      </Link>
                    </div>
                    {index < data.providers.length - 1 ? (
                      <Separator className="bg-foreground/8" />
                    ) : null}
                  </div>
                ))}
                <div className="px-5 pb-2">
                  <Link
                    href={buildOrgWorkspaceHref(organizationSlug, "integrations")}
                    className="mt-2 inline-flex items-center gap-2 text-sm text-foreground/54 hover:text-foreground"
                  >
                    <span>Manage providers</span>
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="text-xl text-foreground">Resource shortcuts</CardTitle>
                <CardDescription className="text-foreground/48">
                  Jump to unified workspace pages with provider filters applied.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 px-5 pb-5">
                {[
                  {
                    label: "Files",
                    detail: `${data.counts.staleFiles} stale`,
                    icon: File01Icon,
                    href: buildOrgWorkspaceHref(organizationSlug, "files", {
                      origin: "provider",
                    }),
                  },
                  {
                    label: "Jobs",
                    detail: `${data.counts.openProviderJobs} open`,
                    icon: TaskDone01Icon,
                    href: buildOrgWorkspaceHref(organizationSlug, "jobs", { source: "provider" }),
                  },
                  {
                    label: "Glossaries",
                    detail: `${data.counts.staleGlossaries} stale`,
                    icon: BookOpenTextIcon,
                    href: buildOrgWorkspaceHref(organizationSlug, "glossaries", {
                      source: "external_tms",
                    }),
                  },
                  {
                    label: "Translation memories",
                    detail: `${data.counts.staleMemories} stale`,
                    icon: DatabaseSyncIcon,
                    href: buildOrgWorkspaceHref(organizationSlug, "translation-memories", {
                      source: "external_tms",
                    }),
                  },
                  {
                    label: "Projects",
                    detail: `${data.counts.externalProjects} synced`,
                    icon: FolderKanbanIcon,
                    href: buildOrgWorkspaceHref(organizationSlug, "projects", {
                      source: "external_tms",
                    }),
                  },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-lg border border-foreground/8 px-4 py-3 transition hover:border-foreground/16 hover:bg-foreground/4"
                  >
                    <div className="flex items-center gap-3">
                      <HugeiconsIcon
                        icon={item.icon}
                        strokeWidth={1.7}
                        className="size-4 text-foreground/48"
                      />
                      <TypographyP className="text-sm text-foreground">{item.label}</TypographyP>
                    </div>
                    <TypographyP className="text-xs text-foreground/48">{item.detail}</TypographyP>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
            <CardHeader className="px-5 pt-5">
              <CardTitle className="text-xl text-foreground">Locale readiness</CardTitle>
              <CardDescription className="text-foreground/48">
                Aggregated translation readiness from synced provider files. Open Files to inspect
                per-locale status.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-3">
              {data.localeReadiness.length === 0 ? (
                <TypographyP className="px-5 py-4 text-sm text-foreground/52">
                  No locale readiness data yet. Sync provider files to populate readiness metrics.
                </TypographyP>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-xl">
                    <div className="grid grid-cols-[minmax(8rem,1fr)_7rem_5rem_5rem_5rem] gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-foreground/38 uppercase">
                      <span>Locale</span>
                      <span>Status</span>
                      <span>Ready</span>
                      <span>Missing</span>
                      <span>Changed</span>
                    </div>
                    <Separator className="bg-foreground/8" />
                    {data.localeReadiness.map((row, index) => (
                      <div key={row.locale}>
                        <Link
                          href={buildOrgWorkspaceHref(organizationSlug, "files", {
                            locale: row.locale,
                            origin: "provider",
                          })}
                          className="grid grid-cols-[minmax(8rem,1fr)_7rem_5rem_5rem_5rem] items-center gap-3 px-5 py-3 transition hover:bg-foreground/4"
                        >
                          <TypographyP className="text-sm font-medium text-foreground">
                            {row.locale}
                          </TypographyP>
                          <Badge
                            variant="outline"
                            className={cn(
                              "w-fit rounded-full px-2.5 py-0 text-[0.7rem]",
                              toneClass(localeStatusTone(row)),
                            )}
                          >
                            {localeStatusLabel(row)}
                          </Badge>
                          <TypographyP className="text-sm text-foreground/58">
                            {row.ready}
                          </TypographyP>
                          <TypographyP className="text-sm text-foreground/58">
                            {row.missing}
                          </TypographyP>
                          <TypographyP className="text-sm text-foreground/58">
                            {row.changed}
                          </TypographyP>
                        </Link>
                        {index < data.localeReadiness.length - 1 ? (
                          <Separator className="bg-foreground/8" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {data.recentFailedSyncRuns.length > 0 ? (
            <Card
              id="recent-failed-sync-runs"
              className="scroll-mt-6 rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0"
            >
              <CardHeader className="px-5 pt-5">
                <CardTitle className="text-xl text-foreground">Recent failed sync runs</CardTitle>
                <CardDescription className="text-foreground/48">
                  Latest provider sync failures from the last {FAILED_SYNC_RUNS_RECENCY_DAYS} days.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-3">
                {data.recentFailedSyncRuns.map((run, index) => (
                  <div key={run.id}>
                    <div className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("rounded-full", toneClass("risk"))}>
                          {providerLabel(run.providerKind)}
                        </Badge>
                        <TypographyP className="text-sm font-medium text-foreground">
                          {run.kind.replaceAll("_", " ")}
                        </TypographyP>
                        <TypographyP className="text-xs text-foreground/42">
                          {formatRelativeTimestamp(run.startedAt)}
                        </TypographyP>
                      </div>
                      {run.errorMessage ? (
                        <TypographyP className="mt-2 text-xs text-foreground/52">
                          {run.errorMessage}
                        </TypographyP>
                      ) : null}
                    </div>
                    {index < data.recentFailedSyncRuns.length - 1 ? (
                      <Separator className="bg-foreground/8" />
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
