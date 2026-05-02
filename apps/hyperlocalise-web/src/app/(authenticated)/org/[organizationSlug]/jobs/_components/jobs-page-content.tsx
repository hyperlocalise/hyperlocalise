"use client";

import { useMemo, useState } from "react";
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

type JobsScope = "all" | "mine";

type ApiProject = {
  id: string;
  name: string;
};

type ApiJob = {
  id: string;
  projectId: string;
  createdByUserId: string | null;
  type: "string" | "file";
  status: "queued" | "running" | "succeeded" | "failed";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  workflowRunId: string | null;
  lastError: string | null;
  inputPayload: unknown;
  outcomeKind: string | null;
  outcomePayload: unknown;
};

type JobRow = ApiJob & {
  projectName: string;
};

const statusOptions = ["all", "queued", "running", "succeeded", "failed"] as const;

function jobTone(status: ApiJob["status"]): Tone {
  switch (status) {
    case "succeeded":
      return "safe";
    case "failed":
      return "risk";
    case "queued":
      return "watch";
    default:
      return "info";
  }
}

function formatRelativeTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absoluteSeconds < 60) return rtf.format(deltaSeconds, "second");
  if (absoluteSeconds < 3_600) return rtf.format(Math.round(deltaSeconds / 60), "minute");
  if (absoluteSeconds < 86_400) return rtf.format(Math.round(deltaSeconds / 3_600), "hour");
  if (absoluteSeconds < 2_592_000) return rtf.format(Math.round(deltaSeconds / 86_400), "day");
  if (absoluteSeconds < 31_536_000) {
    return rtf.format(Math.round(deltaSeconds / 2_592_000), "month");
  }
  return rtf.format(Math.round(deltaSeconds / 31_536_000), "year");
}

function getJobName(job: ApiJob) {
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
}: {
  emptyLabel: string;
  isLoading: boolean;
  jobs: JobRow[];
}) {
  if (isLoading) {
    return <p className="px-3 py-8 text-sm text-white/58">Loading jobs…</p>;
  }

  if (jobs.length === 0) {
    return <p className="px-3 py-8 text-sm text-white/58">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[55rem]">
        <div className="grid grid-cols-[minmax(18rem,1fr)_minmax(14rem,0.7fr)_9rem_11rem_3rem] gap-4 px-3 py-3 text-sm font-medium text-white/42">
          <p>Name</p>
          <p>Project</p>
          <p>Status</p>
          <p className="text-right">Updated</p>
          <span aria-hidden />
        </div>
        {jobs.map((job, index) => (
          <div key={job.id}>
            <div className="grid grid-cols-[minmax(18rem,1fr)_minmax(14rem,0.7fr)_9rem_11rem_3rem] items-center gap-4 px-3 py-4">
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-white">{getJobName(job)}</p>
                <p className="mt-1 truncate text-xs text-white/38">{job.id}</p>
              </div>
              <p className="truncate text-base text-white/58">{job.projectName}</p>
              <Badge
                variant="outline"
                className={cn("w-fit rounded-full capitalize", toneClass(jobTone(job.status)))}
              >
                {job.status}
              </Badge>
              <p className="text-right text-base text-white/58">
                {formatRelativeTime(job.updatedAt)}
              </p>
              <button
                type="button"
                aria-label={`Open actions for ${getJobName(job)}`}
                className="flex size-9 items-center justify-center rounded-lg text-white/58 transition-colors hover:bg-white/6 hover:text-white"
              >
                <HugeiconsIcon
                  icon={MoreHorizontalCircle01Icon}
                  strokeWidth={2}
                  className="size-5"
                />
              </button>
            </div>
            {index < jobs.length - 1 ? <Separator className="bg-white/8" /> : null}
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
  const projectsQuery = useQuery({
    queryKey: ["translation-projects", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error(`Failed to load projects (${response.status})`);
      }

      const body = (await response.json()) as { projects: ApiProject[] };
      return body.projects;
    },
  });

  const projects = projectsQuery.data ?? [];
  const projectIds = projects.map((project) => project.id).join(",");
  const jobsQuery = useQuery({
    queryKey: ["jobs", organizationSlug, scope, projectIds],
    enabled: projectsQuery.isSuccess && projects.length > 0,
    queryFn: async () => {
      const jobGroups = await Promise.all(
        projects.map(async (project) => {
          const response = await apiClient.api.orgs[":organizationSlug"].projects[
            ":projectId"
          ].jobs.$get({
            param: { organizationSlug, projectId: project.id },
            query: {
              limit: "100",
              mine: scope === "mine" ? "true" : "false",
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to load jobs (${response.status})`);
          }

          const body = (await response.json()) as { jobs: ApiJob[] };
          return body.jobs.map((job) => ({ ...job, projectName: project.name }));
        }),
      );

      return jobGroups
        .flat()
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    },
  });

  const jobs = jobsQuery.data ?? [];
  const visibleJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return jobs.filter((job) => {
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      const matchesSearch =
        !normalizedSearch ||
        [getJobName(job), job.projectName, job.id, job.type, job.status]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [jobs, search, statusFilter]);

  const isLoading = projectsQuery.isLoading || jobsQuery.isLoading;
  const errorMessage =
    (projectsQuery.error instanceof Error && projectsQuery.error.message) ||
    (jobsQuery.error instanceof Error && jobsQuery.error.message) ||
    "";
  const title = scope === "mine" ? "My Jobs" : "Jobs";
  const emptyLabel =
    scope === "mine" ? "No jobs found for your account." : "No jobs found for this workspace.";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-4xl font-semibold text-white md:text-5xl">{title}</h1>
      </div>

      {scope === "all" ? <JobsStats jobs={jobs} /> : null}

      <section className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <HugeiconsIcon
              icon={SearchIcon}
              strokeWidth={2}
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-white/42"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search jobs..."
              className="h-12 rounded-lg border-white/14 bg-transparent pl-12 text-base text-white placeholder:text-white/42"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
          >
            <SelectTrigger className="h-12 w-full rounded-lg border-white/14 bg-transparent px-4 text-base text-white lg:w-44">
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

        {errorMessage ? <p className="text-sm text-flame-100">{errorMessage}</p> : null}

        <JobsList emptyLabel={emptyLabel} isLoading={isLoading} jobs={visibleJobs} />
      </section>
    </div>
  );
}
