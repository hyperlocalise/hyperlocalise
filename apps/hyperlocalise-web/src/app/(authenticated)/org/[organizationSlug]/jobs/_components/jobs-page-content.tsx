"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SearchIcon, Task01Icon, WorkHistoryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/tms-user-connection-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { cn } from "@/lib/primitives/cn";

import { formatLocaleList, getCrowdinTargetLocales } from "./provider-crowdin-job-display";

import {
  JOB_STATUS_FILTERS,
  readWorkspaceFilterParam,
} from "../../_components/workspace-filter-params";
import {
  PageHeader,
  WorkspacePageShell,
  toneClass,
  type Tone,
} from "../../_components/workspace-resource-shared";
import {
  ProjectPageShell,
  ProjectSectionHeader,
} from "../../projects/[projectId]/_components/project-page-shell";
import { TypographyP } from "@/components/ui/typography";

type JobsScope = "all" | "mine";

type ApiJob = {
  id: string;
  projectId: string | null;
  createdByUserId: string | null;
  kind: "translation" | "research" | "review" | "sync" | "asset_management";
  type: "string" | "file" | null;
  status: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  workflowRunId: string | null;
  lastError: string | null;
  inputPayload: unknown;
  outcomeKind: string | null;
  outcomePayload: unknown;
  reviewCriteria: string | null;
  reviewTargetLocale: string | null;
  syncConnectorKind: string | null;
  syncDirection: string | null;
  assetType: string | null;
  assetOperation: string | null;
  externalProviderKind: string | null;
  externalTaskId: string | null;
  externalStatus: string | null;
  externalTitle: string | null;
  externalDueDate: string | null;
  externalTargetLocales: string[] | null;
  externalAssignedUsers: string[] | null;
  externalSyncState: string | null;
};

type JobRow = ApiJob & {
  projectName: string | null;
};

const statusOptions = [
  "all",
  "queued",
  "running",
  "succeeded",
  "failed",
  "waiting_for_review",
  "cancelled",
] as const;

const statusFilterLabels = {
  all: "All status",
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  waiting_for_review: "Waiting for review",
  cancelled: "Cancelled",
} as const satisfies Record<(typeof statusOptions)[number], string>;

const jobsFilterTriggerClassName =
  "h-9 min-h-9 w-full border-foreground/14 bg-transparent px-3 text-sm text-foreground data-[size=default]:h-9";

const jobsFilterSelectContentClassName =
  "w-max min-w-[var(--anchor-width)] max-w-[min(16rem,calc(100vw-2rem))]";

const jobsTableGridClassName =
  "grid grid-cols-[minmax(13rem,1.35fr)_7.5rem_minmax(8rem,0.8fr)_7.5rem_minmax(10rem,1fr)_5.5rem] gap-3";

function JobsFilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function jobTone(status: ApiJob["status"]): Tone {
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

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function formatRelativeTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  if (absoluteSeconds < 60) return RELATIVE_TIME_FORMATTER.format(deltaSeconds, "second");
  if (absoluteSeconds < 3_600)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 60), "minute");
  if (absoluteSeconds < 86_400)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 3_600), "hour");
  if (absoluteSeconds < 2_592_000)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 86_400), "day");
  if (absoluteSeconds < 31_536_000)
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 2_592_000), "month");
  return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 31_536_000), "year");
}

function sourceLabel(job: ApiJob) {
  return job.externalProviderKind ? `Provider · ${job.externalProviderKind}` : "Native";
}

function targetLocales(job: ApiJob) {
  if (job.externalTargetLocales?.length) return job.externalTargetLocales.join(", ");
  if (job.reviewTargetLocale) return job.reviewTargetLocale;
  return "—";
}

function assignees(job: ApiJob) {
  if (job.externalAssignedUsers?.length) return job.externalAssignedUsers.join(", ");
  return "—";
}

function formatJobName(value: string) {
  return value.slice(0, 72);
}

function getInputPayloadString(job: ApiJob, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return null;
  }
  const value = (job.inputPayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getJobName(job: ApiJob) {
  if (job.externalTitle) return formatJobName(job.externalTitle);
  if (job.kind === "review" && job.reviewCriteria)
    return formatJobName(`Review: ${job.reviewCriteria}`);
  if (job.kind === "sync" && job.syncConnectorKind)
    return formatJobName(`${job.syncDirection ?? "sync"} ${job.syncConnectorKind}`);
  if (job.kind === "asset_management" && job.assetType)
    return formatJobName(`${job.assetOperation ?? "manage"} ${job.assetType}`);
  const researchScope = getInputPayloadString(job, "scope");
  if (job.kind === "research" && researchScope) return formatJobName(`Research: ${researchScope}`);
  const sourceText = getInputPayloadString(job, "sourceText");
  if (sourceText) return formatJobName(sourceText);
  const sourceFileId = getInputPayloadString(job, "sourceFileId");
  if (sourceFileId) return formatJobName(sourceFileId);
  return job.id;
}

function formatJobKind(job: ApiJob) {
  if (job.kind === "translation" && job.type) return `${job.kind.replace("_", " ")} · ${job.type}`;
  return job.kind.replace("_", " ");
}

function taskDetailSummary(job: ApiJob) {
  const fallbackTargetLocales = job.externalTargetLocales?.length
    ? job.externalTargetLocales
    : job.reviewTargetLocale
      ? [job.reviewTargetLocale]
      : [];
  const locales = formatLocaleList(getCrowdinTargetLocales(null, fallbackTargetLocales));
  const people = assignees(job);
  if (locales === "—" && people === "—") return "No locales or assignees";
  if (locales === "—") return people;
  if (people === "—") return locales;
  return `${locales} · ${people}`;
}

function JobsList({
  emptyLabel,
  isLoading,
  jobs,
  organizationSlug,
  projectId,
}: {
  emptyLabel: string;
  isLoading: boolean;
  jobs: JobRow[];
  organizationSlug: string;
  projectId?: string;
}) {
  if (isLoading)
    return (
      <TypographyP className="px-3 py-8 text-sm text-foreground/58">Loading jobs…</TypographyP>
    );
  if (jobs.length === 0) {
    return <TypographyP className="px-3 py-8 text-sm text-foreground/58">{emptyLabel}</TypographyP>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <div className="min-w-[56rem]">
          <div
            className={cn(
              jobsTableGridClassName,
              "px-3 py-3 text-sm font-medium text-foreground/42",
            )}
          >
            <TypographyP>Name</TypographyP>
            <TypographyP>Source</TypographyP>
            <TypographyP>Project</TypographyP>
            <TypographyP>Status</TypographyP>
            <TypographyP>Task details</TypographyP>
            <span aria-hidden />
          </div>
          {jobs.map((job, index) => {
            const detailHref = getJobDetailHref(
              organizationSlug,
              projectId ?? job.projectId,
              job.id,
            );

            return (
              <div key={job.id}>
                <div className={cn(jobsTableGridClassName, "items-center px-3 py-3")}>
                  {detailHref ? (
                    <Button
                      nativeButton={false}
                      render={<Link href={detailHref} />}
                      variant="ghost"
                      className="-mx-2 h-auto min-w-0 justify-start px-2 py-1 text-left hover:bg-foreground/6"
                    >
                      <JobListItemTitle job={job} />
                    </Button>
                  ) : (
                    <div className="min-w-0 px-0 py-1">
                      <JobListItemTitle job={job} />
                    </div>
                  )}
                  <Badge variant="outline" className="w-fit rounded-full">
                    {sourceLabel(job)}
                  </Badge>
                  <TypographyP className="truncate text-sm text-foreground/58">
                    {job.projectName ?? "Workspace"}
                  </TypographyP>
                  <Badge
                    variant="outline"
                    className={cn("w-fit rounded-full capitalize", toneClass(jobTone(job.status)))}
                  >
                    {job.status}
                  </Badge>
                  <div className="min-w-0">
                    <TypographyP className="truncate text-sm text-foreground/68">
                      {taskDetailSummary(job)}
                    </TypographyP>
                    <TypographyP className="mt-1 truncate text-xs text-foreground/38">
                      Due {formatRelativeTime(job.externalDueDate)} · Synced{" "}
                      {formatRelativeTime(job.updatedAt)}
                    </TypographyP>
                  </div>
                  {detailHref ? (
                    <Button
                      nativeButton={false}
                      render={<Link href={detailHref} />}
                      variant="outline"
                      size="sm"
                      className="w-fit"
                    >
                      Details
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="w-fit" disabled>
                      Details
                    </Button>
                  )}
                </div>
                {index < jobs.length - 1 ? <Separator className="bg-foreground/8" /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function getJobDetailHref(
  organizationSlug: string,
  projectId: string | null | undefined,
  jobId: string,
) {
  if (!projectId) {
    return null;
  }

  return `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
}

function JobListItemTitle({ job }: { job: ApiJob }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-base font-medium text-foreground">
        {getJobName(job)}
      </span>
      <span className="mt-1 block truncate text-xs font-normal text-foreground/38">
        {formatJobKind(job)} · {job.externalTaskId ?? job.id}
      </span>
    </span>
  );
}

export function JobsPageContent({
  organizationSlug,
  scope = "all",
  projectId,
}: {
  organizationSlug: string;
  scope?: JobsScope;
  projectId?: string;
}) {
  const searchParams = useSearchParams();
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>(() => {
    const status = readWorkspaceFilterParam(searchParams, "status", JOB_STATUS_FILTERS);
    return (statusOptions as readonly string[]).includes(status)
      ? (status as (typeof statusOptions)[number])
      : "all";
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs", organizationSlug, scope, statusFilter, projectId ?? "workspace"],
    queryFn: async () => {
      if (projectId) {
        const response = await apiClient.api.orgs[":organizationSlug"].projects[
          ":projectId"
        ].jobs.$get({
          param: { organizationSlug, projectId },
          query: {
            limit: "100",
            mine: "false",
            ...(statusFilter === "all" ? {} : { status: statusFilter }),
          },
        });
        if (!response.ok) throw await readApiResponseError(response, "Failed to load jobs");
        const body = (await response.json()) as { jobs: ApiJob[] };
        return body.jobs.map((job) => ({ ...job, projectName: null }));
      }

      const response = await apiClient.api.orgs[":organizationSlug"].jobs.$get({
        param: { organizationSlug },
        query: {
          limit: "100",
          mine: scope === "mine" ? "true" : "false",
          ...(statusFilter === "all" ? {} : { status: statusFilter }),
        },
      });
      if (!response.ok) throw await readApiResponseError(response, "Failed to load jobs");
      const body = (await response.json()) as { jobs: JobRow[] };
      return body.jobs;
    },
  });

  const jobs = jobsQuery.data ?? [];
  const visibleJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      const matchesSearch =
        !normalizedSearch ||
        [
          getJobName(job),
          job.projectName,
          job.id,
          job.kind,
          job.externalProviderKind,
          job.externalStatus,
          targetLocales(job),
          assignees(job),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [jobs, search, statusFilter]);

  const isMyWork = scope === "mine";
  const emptyLabel = projectId
    ? "No jobs found for this project."
    : scope === "mine"
      ? "No work items found for your account."
      : "No jobs found for this workspace.";

  const jobsSection = (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <JobsFilterField label="Search" className="min-w-0 flex-1">
          <div className="relative">
            <HugeiconsIcon
              icon={SearchIcon}
              strokeWidth={2}
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/42"
            />
            <Input
              id={searchId}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Jobs, providers, locales, assignees..."
              className="h-9 border-foreground/14 bg-transparent pl-9 text-foreground placeholder:text-foreground/42"
            />
          </div>
        </JobsFilterField>
        <JobsFilterField label="Status" className="w-full lg:w-40">
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter((value ?? "all") as (typeof statusOptions)[number])
            }
          >
            <SelectTrigger className={jobsFilterTriggerClassName}>
              <SelectValue>{statusFilterLabels[statusFilter]}</SelectValue>
            </SelectTrigger>
            <SelectContent className={jobsFilterSelectContentClassName}>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status} label={statusFilterLabels[status]}>
                  {statusFilterLabels[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </JobsFilterField>
      </div>
      {jobsQuery.error ? (
        <div>
          {isTmsUserConnectionRequiredError(jobsQuery.error) ? (
            <TmsUserConnectionErrorPanel
              organizationSlug={organizationSlug}
              resource="jobs"
              error={jobsQuery.error}
            />
          ) : (
            <>
              <TypographyP className="text-sm font-medium text-flame-100">
                Jobs failed to load.
              </TypographyP>
              <TypographyP className="mt-1 text-sm text-foreground/58">
                {jobsQuery.error instanceof Error
                  ? jobsQuery.error.message
                  : "Failed to load jobs."}
              </TypographyP>
            </>
          )}
        </div>
      ) : null}
      <JobsList
        emptyLabel={emptyLabel}
        isLoading={jobsQuery.isLoading}
        jobs={visibleJobs}
        organizationSlug={organizationSlug}
        projectId={projectId}
      />
    </section>
  );

  if (projectId) {
    return (
      <ProjectPageShell>
        <ProjectSectionHeader
          icon={Task01Icon}
          section="Jobs"
          description="Translation, review, QA, and sync work."
        />
        {jobsSection}
      </ProjectPageShell>
    );
  }

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={isMyWork ? WorkHistoryIcon : Task01Icon}
        label="Workspace"
        title={isMyWork ? "My Jobs" : "Jobs"}
        description={
          isMyWork
            ? "Translation, review, and sync work assigned to you across projects."
            : "Translation, review, QA, and sync work tracked across the workspace."
        }
      />
      {jobsSection}
    </WorkspacePageShell>
  );
}
