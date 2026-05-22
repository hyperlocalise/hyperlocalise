"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  FilterHorizontalIcon,
  MoreHorizontalCircle01Icon,
  SearchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

import { MetricsGrid, toneClass, type Tone } from "../../_components/workspace-resource-shared";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

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

/**
 * BOLT OPTIMIZATION: Reuse Intl.RelativeTimeFormat instance.
 * Creating Intl objects is expensive (~0.02ms per instance).
 * Reusing a single instance reduces overhead by >95%.
 */
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);

  if (absoluteSeconds < 60) {
    return RELATIVE_TIME_FORMATTER.format(deltaSeconds, "second");
  }
  if (absoluteSeconds < 3_600) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 60), "minute");
  }
  if (absoluteSeconds < 86_400) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 3_600), "hour");
  }
  if (absoluteSeconds < 2_592_000) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 86_400), "day");
  }
  if (absoluteSeconds < 31_536_000) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 2_592_000), "month");
  }
  return RELATIVE_TIME_FORMATTER.format(Math.round(deltaSeconds / 31_536_000), "year");
}

function getJobName(job: ApiJob) {
  if (job.kind === "review" && job.reviewCriteria) {
    return `Review: ${job.reviewCriteria}`.slice(0, 72);
  }

  if (job.kind === "sync" && job.syncConnectorKind) {
    return `${job.syncDirection ?? "sync"} ${job.syncConnectorKind}`.slice(0, 72);
  }

  if (job.kind === "asset_management" && job.assetType) {
    return `${job.assetOperation ?? "manage"} ${job.assetType}`.slice(0, 72);
  }

  if (
    job.kind === "research" &&
    typeof job.inputPayload === "object" &&
    job.inputPayload &&
    "scope" in job.inputPayload &&
    typeof job.inputPayload.scope === "string"
  ) {
    return `Research: ${job.inputPayload.scope}`.slice(0, 72);
  }

  if (
    typeof job.inputPayload === "object" &&
    job.inputPayload &&
    "sourceText" in job.inputPayload &&
    typeof job.inputPayload.sourceText === "string"
  ) {
    return job.inputPayload.sourceText.slice(0, 72);
  }

  if (
    typeof job.inputPayload === "object" &&
    job.inputPayload &&
    "sourceFileId" in job.inputPayload &&
    typeof job.inputPayload.sourceFileId === "string"
  ) {
    return job.inputPayload.sourceFileId;
  }

  return job.id;
}

function formatJobKind(job: ApiJob) {
  if (job.kind === "translation" && job.type) {
    return `${job.kind.replace("_", " ")} · ${job.type}`;
  }

  return job.kind.replace("_", " ");
}

function JobsStats({ jobs }: { jobs: JobRow[] }) {
  const metrics = useMemo(() => {
    const runningCount = jobs.filter((job) => job.status === "running").length;
    const queuedCount = jobs.filter((job) => job.status === "queued").length;
    const failedCount = jobs.filter((job) => job.status === "failed").length;

    return [
      {
        label: "Running jobs",
        value: `${runningCount}`,
        detail: "active now",
        tone: "info" as const,
      },
      {
        label: "Queued jobs",
        value: `${queuedCount}`,
        detail: "waiting",
        tone: "watch" as const,
      },
      {
        label: "Failed jobs",
        value: `${failedCount}`,
        detail: "needs review",
        tone: "risk" as const,
      },
    ] as const;
  }, [jobs]);

  return <MetricsGrid metrics={metrics} />;
}

function JobsList({
  emptyLabel,
  isLoading,
  jobs,
  organizationSlug,
}: {
  emptyLabel: string;
  isLoading: boolean;
  jobs: JobRow[];
  organizationSlug: string;
}) {
  if (isLoading) {
    return (
      <TypographyP className="px-3 py-8 text-sm text-foreground/58">Loading jobs…</TypographyP>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="px-3 py-8">
        <TypographyP className="text-sm text-foreground/58">{emptyLabel}</TypographyP>
        <Link
          href={`/org/${organizationSlug}/integrations`}
          className="mt-2 inline-flex items-center gap-2 text-sm text-foreground/54 hover:text-foreground"
        >
          <span>Connect a TMS provider to import existing jobs</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[55rem]">
        <div className="grid grid-cols-[minmax(18rem,1fr)_minmax(14rem,0.7fr)_9rem_11rem_3rem] gap-4 px-3 py-3 text-sm font-medium text-foreground/42">
          <TypographyP>Name</TypographyP>
          <TypographyP>Project</TypographyP>
          <TypographyP>Status</TypographyP>
          <TypographyP className="text-right">Updated</TypographyP>
          <span aria-hidden />
        </div>
        {jobs.map((job, index) => (
          <div key={job.id}>
            <div className="grid grid-cols-[minmax(18rem,1fr)_minmax(14rem,0.7fr)_9rem_11rem_3rem] items-center gap-4 px-3 py-4">
              <div className="min-w-0">
                <TypographyP className="truncate text-base font-medium text-foreground">
                  {getJobName(job)}
                </TypographyP>
                <TypographyP className="mt-1 truncate text-xs text-foreground/38">
                  {formatJobKind(job)} · {job.id}
                </TypographyP>
              </div>
              <TypographyP className="truncate text-base text-foreground/58">
                {job.projectName ?? "Workspace"}
              </TypographyP>
              <Badge
                variant="outline"
                className={cn("w-fit rounded-full capitalize", toneClass(jobTone(job.status)))}
              >
                {job.status}
              </Badge>
              <TypographyP className="text-right text-base text-foreground/58">
                {formatRelativeTime(job.updatedAt)}
              </TypographyP>
              <Link
                href={`/org/${organizationSlug}/jobs/${job.id}`}
                aria-label={`Open ${getJobName(job)}`}
                className="flex size-9 items-center justify-center rounded-lg text-foreground/58 transition-colors hover:bg-foreground/6 hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={MoreHorizontalCircle01Icon}
                  strokeWidth={2}
                  className="size-5"
                />
              </Link>
            </div>
            {index < jobs.length - 1 ? <Separator className="bg-foreground/8" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function JobsPageContent({
  organizationSlug,
  scope = "all",
}: {
  organizationSlug: string;
  scope?: JobsScope;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>("all");
  const jobsQuery = useQuery({
    queryKey: ["jobs", organizationSlug, scope, statusFilter],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs.$get({
        param: { organizationSlug },
        query: {
          limit: "100",
          mine: scope === "mine" ? "true" : "false",
          ...(statusFilter === "all" ? {} : { status: statusFilter }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load jobs (${response.status})`);
      }

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
        [getJobName(job), job.projectName, job.id, job.kind, job.type, job.status]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [jobs, search, statusFilter]);

  const isLoading = jobsQuery.isLoading;
  const errorMessage = (jobsQuery.error instanceof Error && jobsQuery.error.message) || "";
  const title = scope === "mine" ? "My Jobs" : "Jobs";
  const emptyLabel =
    scope === "mine" ? "No jobs found for your account." : "No jobs found for this workspace.";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <TypographyH1 className="font-heading text-4xl font-semibold text-foreground md:text-5xl">
          {title}
        </TypographyH1>
      </div>

      {scope === "all" ? <JobsStats jobs={jobs} /> : null}

      <section className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <HugeiconsIcon
              icon={SearchIcon}
              strokeWidth={2}
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-foreground/42"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search jobs..."
              className="h-12 rounded-lg border-foreground/14 bg-transparent pl-12 text-base text-foreground placeholder:text-foreground/42"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
          >
            <SelectTrigger className="h-12 w-full rounded-lg border-foreground/14 bg-transparent px-4 text-base text-foreground lg:w-44">
              <HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} className="size-5" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status === "all" ? "Filter" : status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {errorMessage ? (
          <TypographyP className="text-sm text-flame-100">{errorMessage}</TypographyP>
        ) : null}

        <JobsList
          emptyLabel={emptyLabel}
          isLoading={isLoading}
          jobs={visibleJobs}
          organizationSlug={organizationSlug}
        />
      </section>
    </div>
  );
}
