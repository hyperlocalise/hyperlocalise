"use client";

import Link from "next/link";
import {
  AlertCircleIcon,
  ArrowRight01Icon,
  DatabaseSyncIcon,
  FolderKanbanIcon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";
import { createApiClient } from "@/lib/api-client";
import { cn } from "@/lib/primitives/cn";
import type { OrganizationTmsDashboardSummary } from "@/lib/providers/organization-tms-dashboard-summary.types";

import { buildOrgWorkspaceHref } from "../../_components/workspace-filter-params";
import { formatRelativeTimestamp, providerLabel } from "../../_components/workspace-files-shared";

const api = createApiClient();

type Tone = "safe" | "watch" | "risk" | "info";

type DashboardJob = {
  id: string;
  projectName: string | null;
  kind: "translation" | "research" | "review" | "sync" | "asset_management";
  type: "string" | "file" | null;
  status: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  updatedAt: string;
  inputPayload: unknown;
  reviewCriteria: string | null;
  reviewTargetLocale: string | null;
  syncConnectorKind: string | null;
  syncDirection: string | null;
  assetType: string | null;
  assetOperation: string | null;
  externalProviderKind: string | null;
  externalTaskId: string | null;
  externalTitle: string | null;
  externalDueDate: string | null;
  externalTargetLocales: string[] | null;
};

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

function jobTone(status: DashboardJob["status"]): Tone {
  switch (status) {
    case "succeeded":
      return "safe";
    case "failed":
      return "risk";
    case "queued":
    case "waiting_for_review":
      return "watch";
    default:
      return "info";
  }
}

function formatJobName(job: DashboardJob) {
  if (job.externalTitle) return job.externalTitle.slice(0, 72);
  if (job.kind === "review" && job.reviewCriteria)
    return `Review: ${job.reviewCriteria}`.slice(0, 72);
  if (job.kind === "sync" && job.syncConnectorKind)
    return `${job.syncDirection ?? "sync"} ${job.syncConnectorKind}`.slice(0, 72);
  if (job.kind === "asset_management" && job.assetType)
    return `${job.assetOperation ?? "manage"} ${job.assetType}`.slice(0, 72);
  if (
    typeof job.inputPayload === "object" &&
    job.inputPayload &&
    "sourceText" in job.inputPayload
  ) {
    const sourceText = (job.inputPayload as Record<string, unknown>).sourceText;
    if (typeof sourceText === "string" && sourceText.length > 0) return sourceText.slice(0, 72);
  }
  return job.id;
}

function formatJobKind(job: DashboardJob) {
  if (job.kind === "translation" && job.type) return `${job.kind.replace("_", " ")} · ${job.type}`;
  return job.kind.replace("_", " ");
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

  const jobsQuery = useQuery({
    queryKey: ["dashboard-my-jobs", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].jobs.$get({
        param: { organizationSlug },
        query: {
          limit: "3",
          relationship: "assigned",
        },
      });
      if (!response.ok) throw await readApiResponseError(response, "Failed to load my jobs");
      const body = (await response.json()) as { jobs: DashboardJob[] };
      return body.jobs;
    },
  });

  const providerPreview = data?.providers.slice(0, 3) ?? [];
  const myJobs = jobsQuery.data ?? [];
  const providersHref = buildOrgWorkspaceHref(organizationSlug, "integrations");
  const myJobsHref = `/org/${organizationSlug}/my-jobs`;

  return (
    <section className="flex flex-col gap-4">
      <Card className="rounded-lg border border-foreground/8 bg-foreground/2.5 py-0 text-foreground ring-0">
        <CardHeader className="px-5 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl text-foreground">Workspace setup</CardTitle>
              <CardDescription className="mt-1">
                Start with your connected providers and the work assigned to you.
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
            <TypographyP className="py-4 text-sm text-muted-foreground">
              Loading workspace setup…
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
                  Unable to load workspace setup
                </TypographyP>
                <TypographyP className="mt-1 text-sm text-muted-foreground">
                  Refresh the page or try again in a moment.
                </TypographyP>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <TypographyP className="text-sm font-medium text-foreground">
                      Providers
                    </TypographyP>
                    <TypographyP className="mt-1 text-sm text-muted-foreground">
                      Your first connected TMS integrations.
                    </TypographyP>
                  </div>
                  <HugeiconsIcon
                    icon={FolderKanbanIcon}
                    strokeWidth={1.7}
                    className="mt-0.5 size-5 text-foreground/42"
                  />
                </div>

                <div className="mt-4 grid gap-2">
                  {providerPreview.length === 0 ? (
                    <TypographyP className="rounded-lg border border-dashed border-foreground/10 px-3 py-4 text-sm text-muted-foreground">
                      No providers connected yet.
                    </TypographyP>
                  ) : (
                    providerPreview.map((credential) => (
                      <div
                        key={credential.id}
                        className="rounded-lg border border-foreground/8 px-3 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <TypographyP className="text-sm font-medium text-foreground">
                            {credential.displayName}
                          </TypographyP>
                        </div>
                        <TypographyP className="mt-1 text-xs text-muted-foreground">
                          {providerLabel(credential.providerKind)} · {credential.projectCount}{" "}
                          projects
                          {credential.lastSuccessfulSyncAt
                            ? ` · last sync ${formatRelativeTimestamp(credential.lastSuccessfulSyncAt)}`
                            : ""}
                        </TypographyP>
                      </div>
                    ))
                  )}
                </div>

                <Link
                  href={providersHref}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <span>View more providers</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
                </Link>
              </div>

              <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <TypographyP className="text-sm font-medium text-foreground">
                      My jobs
                    </TypographyP>
                    <TypographyP className="mt-1 text-sm text-muted-foreground">
                      The latest work items assigned to your account.
                    </TypographyP>
                  </div>
                  <HugeiconsIcon
                    icon={TaskDone01Icon}
                    strokeWidth={1.7}
                    className="mt-0.5 size-5 text-foreground/42"
                  />
                </div>

                <div className="mt-4 grid gap-2">
                  {jobsQuery.isLoading ? (
                    <TypographyP className="rounded-lg border border-dashed border-foreground/10 px-3 py-4 text-sm text-muted-foreground">
                      Loading my jobs…
                    </TypographyP>
                  ) : jobsQuery.isError ? (
                    <TypographyP className="rounded-lg border border-flame-700/20 bg-flame-700/10 px-3 py-4 text-sm text-muted-foreground">
                      My jobs could not be loaded.
                    </TypographyP>
                  ) : myJobs.length === 0 ? (
                    <TypographyP className="rounded-lg border border-dashed border-foreground/10 px-3 py-4 text-sm text-muted-foreground">
                      No jobs assigned to you yet.
                    </TypographyP>
                  ) : (
                    myJobs.map((job) => (
                      <div key={job.id} className="rounded-lg border border-foreground/8 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <TypographyP className="min-w-0 truncate text-sm font-medium text-foreground">
                            {formatJobName(job)}
                          </TypographyP>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full capitalize",
                              toneClass(jobTone(job.status)),
                            )}
                          >
                            {job.status.replaceAll("_", " ")}
                          </Badge>
                        </div>
                        <TypographyP className="mt-1 text-xs text-muted-foreground">
                          {job.projectName ?? "Workspace"} · {formatJobKind(job)} · updated{" "}
                          {formatRelativeTimestamp(job.updatedAt)}
                        </TypographyP>
                      </div>
                    ))
                  )}
                </div>

                <Link
                  href={myJobsHref}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <span>View more jobs</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.7} className="size-4" />
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
