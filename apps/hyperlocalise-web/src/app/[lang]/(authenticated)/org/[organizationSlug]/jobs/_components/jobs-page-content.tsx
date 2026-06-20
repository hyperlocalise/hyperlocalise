"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TranslateIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { parseProviderProjectId } from "@/lib/providers/tms-provider-resource-id";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/tms-user-connection-shared";

import {
  JobsPageErrorMessage,
  JobsPageView,
  jobsStatusOptions,
  type JobsErrorRenderer,
  type JobsLinkRenderer,
  type JobsScope,
  type JobsStatusFilter,
} from "./jobs-page-view";

import {
  JOB_STATUS_FILTERS,
  readWorkspaceFilterParam,
} from "../../_components/workspace-filter-params";

function readInitialStatusFilter(searchParams: URLSearchParams): JobsStatusFilter {
  const status = readWorkspaceFilterParam(searchParams, "status", JOB_STATUS_FILTERS);
  return (jobsStatusOptions as readonly string[]).includes(status)
    ? (status as JobsStatusFilter)
    : "all";
}

function renderProductionJobLink({ href, kind, children }: Parameters<JobsLinkRenderer>[0]) {
  if (kind === "title") {
    return (
      <Button
        nativeButton={false}
        render={<Link href={href} />}
        variant="ghost"
        className="-mx-2 h-auto min-w-0 justify-start px-2 py-1 text-left hover:bg-foreground/6"
      >
        {children}
      </Button>
    );
  }

  if (kind === "cat") {
    return (
      <Button
        nativeButton={false}
        render={<Link href={href} />}
        variant="outline"
        size="sm"
        className="w-fit"
      >
        <HugeiconsIcon icon={TranslateIcon} strokeWidth={1.8} />
        {children}
      </Button>
    );
  }

  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      variant="outline"
      size="sm"
      className="w-fit"
    >
      {children}
    </Button>
  );
}

const renderProductionJobsError: JobsErrorRenderer = ({ error, organizationSlug }) => {
  if (isTmsUserConnectionRequiredError(error)) {
    return (
      <TmsUserConnectionErrorPanel
        organizationSlug={organizationSlug}
        resource="jobs"
        error={error}
      />
    );
  }

  return <JobsPageErrorMessage error={error} />;
};

export function JobsPageContent({
  organizationSlug,
  scope = "all",
  projectId,
}: {
  organizationSlug: string;
  scope?: JobsScope;
  projectId?: string;
}) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => readInitialStatusFilter(searchParams));
  const jobsQueryKey = ["jobs", organizationSlug, scope, statusFilter, projectId ?? "workspace"];
  const assignedJobsQueryKey = [
    "jobs",
    organizationSlug,
    "assigned",
    statusFilter,
    projectId ?? "workspace",
  ];
  const createdJobsQueryKey = [
    "jobs",
    organizationSlug,
    "created",
    statusFilter,
    projectId ?? "workspace",
  ];
  const isProviderProject = Boolean(parseProviderProjectId(projectId));

  const jobsQuery = useQuery({
    queryKey: jobsQueryKey,
    enabled: scope !== "personal",
    queryFn: async () => {
      if (projectId) {
        const response = await apiClient.api.orgs[":organizationSlug"].projects[
          ":projectId"
        ].jobs.$get({
          param: { organizationSlug, projectId },
          query: {
            limit: "100",
            ...(statusFilter === "all" ? {} : { status: statusFilter }),
          },
        });
        if (!response.ok) throw await readApiResponseError(response, "Failed to load jobs");
        const body = await response.json();
        return body.jobs;
      }

      const response = await apiClient.api.orgs[":organizationSlug"].jobs.$get({
        param: { organizationSlug },
        query: {
          limit: "100",
          ...(statusFilter === "all" ? {} : { status: statusFilter }),
        },
      });
      if (!response.ok) throw await readApiResponseError(response, "Failed to load jobs");
      const body = await response.json();
      return body.jobs;
    },
  });
  const assignedJobsQuery = useQuery({
    queryKey: assignedJobsQueryKey,
    enabled: scope === "personal" && !projectId,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs.$get({
        param: { organizationSlug },
        query: {
          limit: "100",
          relationship: "assigned",
          ...(statusFilter === "all" ? {} : { status: statusFilter }),
        },
      });
      if (!response.ok) throw await readApiResponseError(response, "Failed to load assigned jobs");
      const body = await response.json();
      return body.jobs;
    },
  });
  const createdJobsQuery = useQuery({
    queryKey: createdJobsQueryKey,
    enabled: scope === "personal" && !projectId,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs.$get({
        param: { organizationSlug },
        query: {
          limit: "100",
          relationship: "created",
          ...(statusFilter === "all" ? {} : { status: statusFilter }),
        },
      });
      if (!response.ok) throw await readApiResponseError(response, "Failed to load created jobs");
      const body = await response.json();
      return body.jobs;
    },
  });
  const syncProviderJobs = useMutation({
    mutationFn: async () => {
      if (!projectId) {
        throw new Error("Project job sync requires a project.");
      }

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].jobs.sync.$post({
        param: { organizationSlug, projectId },
      });

      if (response.status !== 202) {
        throw await readApiResponseError(response, "Unable to sync provider jobs");
      }

      return response.json();
    },
    onSuccess: async (body) => {
      await queryClient.invalidateQueries({ queryKey: jobsQueryKey });
      toast.success(
        body.providerJobSync.created ? "Job sync queued" : "Job sync is already queued",
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <JobsPageView
      assignedJobs={assignedJobsQuery.data ?? []}
      createdJobs={createdJobsQuery.data ?? []}
      error={jobsQuery.error ?? assignedJobsQuery.error ?? createdJobsQuery.error}
      isLoading={
        scope === "personal"
          ? assignedJobsQuery.isLoading || createdJobsQuery.isLoading
          : jobsQuery.isLoading
      }
      isSyncingProviderJobs={syncProviderJobs.isPending}
      jobs={jobsQuery.data ?? []}
      onSyncProviderJobs={isProviderProject ? syncProviderJobs.mutate : undefined}
      onStatusFilterChange={setStatusFilter}
      organizationSlug={organizationSlug}
      projectId={projectId}
      renderError={renderProductionJobsError}
      renderJobLink={renderProductionJobLink}
      scope={scope}
      statusFilter={statusFilter}
    />
  );
}
