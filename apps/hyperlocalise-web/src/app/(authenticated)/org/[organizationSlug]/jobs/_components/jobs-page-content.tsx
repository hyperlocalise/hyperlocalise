"use client";

import { useMemo, useState } from "react";
import { FileSyncIcon, Task01Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
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

import {
  MetricsGrid,
  PageHeader,
  ResourceCard,
  toneClass,
  type Tone,
} from "../../_components/workspace-resource-shared";

type ApiProject = {
  id: string;
  name: string;
};

type ApiJob = {
  id: string;
  projectId: string;
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

function formatTimestamp(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unserializable payload";
  }
}

export function JobsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
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

  const activeProjectId = selectedProjectId || projectsQuery.data?.[0]?.id || "";

  const jobsQuery = useQuery({
    queryKey: ["translation-jobs", organizationSlug, activeProjectId],
    enabled: Boolean(activeProjectId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].jobs.$get({
        param: { organizationSlug, projectId: activeProjectId },
        query: { limit: "100" },
      });

      if (!response.ok) {
        throw new Error(`Failed to load jobs (${response.status})`);
      }

      const body = (await response.json()) as { jobs: ApiJob[] };
      return body.jobs;
    },
  });

  const jobs = jobsQuery.data ?? [];
  const activeJobId =
    selectedJobId && jobs.some((job) => job.id === selectedJobId)
      ? selectedJobId
      : (jobs[0]?.id ?? "");

  const jobDetailsQuery = useQuery({
    queryKey: ["translation-job-details", organizationSlug, activeProjectId, activeJobId],
    enabled: Boolean(activeProjectId && activeJobId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].jobs[
        ":jobId"
      ].$get({
        param: { organizationSlug, projectId: activeProjectId, jobId: activeJobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load job details (${response.status})`);
      }

      const body = (await response.json()) as { job: ApiJob };
      return body.job;
    },
  });

  const jobMetrics = useMemo(() => {
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
        detail: "waiting for execution",
        tone: "watch" as const,
      },
      {
        label: "Failed jobs",
        value: `${failedCount}`,
        detail: "needs attention",
        tone: "risk" as const,
      },
    ] as const;
  }, [jobs]);

  const jobPipeline = useMemo(() => {
    const steps = ["queued", "running", "succeeded", "failed"] as const;

    return steps.map((status) => ({
      step: status,
      count: `${jobs.filter((job) => job.status === status).length}`,
      detail: `jobs in ${status} state`,
    }));
  }, [jobs]);

  const runningCount = jobs.filter((job) => job.status === "running").length;
  const isLoadingProjects = projectsQuery.isLoading;
  const isLoadingJobs = jobsQuery.isLoading;
  const isLoadingDetails = jobDetailsQuery.isLoading;
  const selectedJobDetails = jobDetailsQuery.data ?? null;
  const errorMessage =
    (projectsQuery.error instanceof Error && projectsQuery.error.message) ||
    (jobsQuery.error instanceof Error && jobsQuery.error.message) ||
    (jobDetailsQuery.error instanceof Error && jobDetailsQuery.error.message) ||
    "";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={Task01Icon}
        label="Translation queue"
        title="Jobs"
        description="Follow translation work from source import through AI drafting, eval gates, human review, and TMS sync."
        statusLabel={isLoadingJobs ? "Loading…" : `${runningCount} running`}
      />
      <MetricsGrid metrics={jobMetrics} />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <ResourceCard
          title="Translation jobs"
          description="Live job queue from API with per-project filtering and details."
          icon={Task01Icon}
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <p className="text-xs tracking-[0.08em] text-white/42 uppercase">Project</p>
            <Select
              value={activeProjectId}
              onValueChange={(projectId) => {
                if (projectId) {
                  setSelectedProjectId(projectId);
                  setSelectedJobId("");
                }
              }}
            >
              <SelectTrigger className="w-72 rounded-lg border-white/12 bg-white/4 text-white">
                <SelectValue
                  placeholder={isLoadingProjects ? "Loading projects…" : "Select project"}
                />
              </SelectTrigger>
              <SelectContent>
                {(projectsQuery.data ?? []).map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Separator className="bg-white/8" />
          {errorMessage ? <p className="px-5 py-4 text-sm text-flame-100">{errorMessage}</p> : null}
          <div className="overflow-x-auto">
            <div className="min-w-208">
              <div className="grid grid-cols-[9rem_8rem_8rem_12rem_12rem_12rem] gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-white/38 uppercase">
                <p>ID</p>
                <p>Type</p>
                <p>Status</p>
                <p>Created</p>
                <p>Updated</p>
                <p>Completed</p>
              </div>
              <Separator className="bg-white/8" />
              {isLoadingJobs ? (
                <p className="px-5 py-4 text-sm text-white/58">Loading jobs…</p>
              ) : null}
              {!isLoadingJobs && jobs.length === 0 ? (
                <p className="px-5 py-4 text-sm text-white/58">No jobs found for this project.</p>
              ) : null}
              {jobs.map((job, index) => (
                <div key={job.id}>
                  <button
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-[9rem_8rem_8rem_12rem_12rem_12rem] items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/3",
                      activeJobId === job.id && "bg-white/6",
                    )}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <p className="truncate text-sm text-white/48">{job.id}</p>
                    <p className="text-sm text-white/58">{job.type}</p>
                    <Badge
                      variant="outline"
                      className={cn("w-fit rounded-full", toneClass(jobTone(job.status)))}
                    >
                      {job.status}
                    </Badge>
                    <p className="text-sm text-white/58">{formatTimestamp(job.createdAt)}</p>
                    <p className="text-sm text-white/48">{formatTimestamp(job.updatedAt)}</p>
                    <p className="text-sm text-white/58">{formatTimestamp(job.completedAt)}</p>
                  </button>
                  {index < jobs.length - 1 ? <Separator className="bg-white/8" /> : null}
                </div>
              ))}
            </div>
          </div>
        </ResourceCard>
        <ResourceCard
          title="Job details"
          description="Selected job payload and execution metadata."
          icon={FileSyncIcon}
        >
          <div className="space-y-4 px-5 py-4">
            {isLoadingDetails ? <p className="text-sm text-white/58">Loading details…</p> : null}
            {!isLoadingDetails && !selectedJobDetails ? (
              <p className="text-sm text-white/58">Select a job to inspect details.</p>
            ) : null}
            {selectedJobDetails ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <p className="text-white/48">Job ID</p>
                  <p className="break-all text-white">{selectedJobDetails.id}</p>
                  <p className="text-white/48">Status</p>
                  <p className="text-white">{selectedJobDetails.status}</p>
                  <p className="text-white/48">Type</p>
                  <p className="text-white">{selectedJobDetails.type}</p>
                  <p className="text-white/48">Workflow run</p>
                  <p className="break-all text-white">{selectedJobDetails.workflowRunId ?? "—"}</p>
                  <p className="text-white/48">Last error</p>
                  <p className="break-all text-white">{selectedJobDetails.lastError ?? "—"}</p>
                </div>
                <Separator className="bg-white/8" />
                <div className="space-y-2">
                  <p className="text-xs tracking-[0.08em] text-white/38 uppercase">Input payload</p>
                  <pre className="max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/72">
                    {formatJson(selectedJobDetails.inputPayload)}
                  </pre>
                </div>
                <div className="space-y-2">
                  <p className="text-xs tracking-[0.08em] text-white/38 uppercase">
                    Outcome payload
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/72">
                    {formatJson(selectedJobDetails.outcomePayload)}
                  </pre>
                </div>
              </>
            ) : null}
          </div>
        </ResourceCard>
      </section>
      <section className="grid gap-4">
        <ResourceCard
          title="Pipeline"
          description="Live distribution by job status."
          icon={FileSyncIcon}
        >
          <div className="px-5 pb-2">
            {jobPipeline.map((stage, index) => (
              <div key={stage.step}>
                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-white">{stage.step}</p>
                    <p className="mt-1 text-xs text-white/42">{stage.detail}</p>
                  </div>
                  <p className="font-heading text-2xl font-medium text-white">{stage.count}</p>
                </div>
                {index < jobPipeline.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
          </div>
        </ResourceCard>
      </section>
    </div>
  );
}
