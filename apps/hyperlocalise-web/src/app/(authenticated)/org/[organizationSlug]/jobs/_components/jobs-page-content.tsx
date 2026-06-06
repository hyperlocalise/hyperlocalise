"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/tms-user-connection-shared";

import {
  JobsPageErrorMessage,
  JobsPageView,
  jobsStatusOptions,
  type ApiJob,
  type JobRow,
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
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => readInitialStatusFilter(searchParams));

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

  return (
    <JobsPageView
      error={jobsQuery.error}
      isLoading={jobsQuery.isLoading}
      jobs={jobsQuery.data ?? []}
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
