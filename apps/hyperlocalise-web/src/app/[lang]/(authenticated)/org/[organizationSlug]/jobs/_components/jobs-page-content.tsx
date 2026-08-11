"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Add01Icon, TranslateIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { TmsUserConnectionErrorPanel } from "@/components/app-shell/tms-user-connection-prompt";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { isNativeWorkspaceJob } from "@/lib/projects/workspace-resource-capabilities";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import { readTmsProviderListResponse } from "@/lib/providers/jobs/tms-provider-list-fetch";
import { isTmsUserConnectionRequiredError } from "@/lib/providers/credentials/tms-user-connection-shared";

import { useActiveTmsProvider } from "../../_hooks/use-active-tms-provider";
import { useProjectPageQuery } from "../../projects/[projectId]/_components/project-page-shell";

import { CreateJobDialog } from "./create-job-dialog";
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
import { jobsPageContentMessages } from "./jobs-page-content.messages";

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
        className="-mx-2 h-auto min-w-0 justify-start px-2 py-1 text-left hover:bg-muted"
      >
        {children}
      </Button>
    );
  }

  if (kind === "cat") {
    return (
      <Button nativeButton={false} render={<Link href={href} />} size="sm" className="w-fit">
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

type JobListResponse = ApiJob & { projectName?: string | null };

function toJobRows(jobs: JobListResponse[]): JobRow[] {
  return jobs.map((job) => ({
    ...job,
    projectName: job.projectName ?? null,
  }));
}

function filterJobsByStatus(jobs: JobRow[], statusFilter: JobsStatusFilter): JobRow[] {
  if (statusFilter === "all") {
    return jobs;
  }

  return jobs.filter((job) => job.status === statusFilter);
}

function toNativeJobRows(jobs: JobRow[]): JobRow[] {
  return jobs.filter(isNativeWorkspaceJob);
}

async function fetchNativeWorkspaceJobs(
  organizationSlug: string,
  statusFilter: JobsStatusFilter,
  loadJobsFailedMessage: string,
  relationship?: "assigned" | "created",
) {
  const response = await apiClient.api.orgs[":organizationSlug"].jobs.$get({
    param: { organizationSlug },
    query: {
      limit: "100",
      ...(relationship ? { relationship } : {}),
      ...(statusFilter === "all" ? {} : { status: statusFilter }),
    },
  });
  if (!response.ok) {
    throw await readApiResponseError(response, loadJobsFailedMessage);
  }

  const body = await response.json();
  return body.jobs as JobListResponse[];
}

async function fetchNativeProjectJobs(
  organizationSlug: string,
  projectId: string,
  statusFilter: JobsStatusFilter,
  loadJobsFailedMessage: string,
) {
  const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].jobs.$get({
    param: { organizationSlug, projectId },
    query: {
      limit: "100",
      ...(statusFilter === "all" ? {} : { status: statusFilter }),
    },
  });
  if (!response.ok) {
    throw await readApiResponseError(response, loadJobsFailedMessage);
  }

  const body = await response.json();
  return body.jobs as JobListResponse[];
}

async function fetchTmsWorkspaceJobs(
  organizationSlug: string,
  loadTmsJobsFailedMessage: string,
  mine = false,
) {
  const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs.$get({
    param: { organizationSlug },
    query: { mine: mine ? "true" : "false" },
  });

  return readTmsProviderListResponse<JobListResponse>(response, "jobs", loadTmsJobsFailedMessage);
}

async function fetchTmsProjectJobs(
  organizationSlug: string,
  externalProjectId: string,
  loadTmsJobsFailedMessage: string,
  mine = false,
) {
  const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].projects[
    ":externalProjectId"
  ].jobs.$get({
    param: { organizationSlug, externalProjectId },
    query: { mine: mine ? "true" : "false" },
  });

  return readTmsProviderListResponse<JobListResponse>(response, "jobs", loadTmsJobsFailedMessage);
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
  const intl = useIntl();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => readInitialStatusFilter(searchParams));
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const parsedProviderProject = projectId ? parseProviderProjectId(projectId) : null;
  const isProviderProjectScope = Boolean(parsedProviderProject);
  const activeTmsProviderQuery = useActiveTmsProvider(organizationSlug);
  const hasActiveTmsConnection = Boolean(activeTmsProviderQuery.data);
  const projectQuery = useProjectPageQuery(organizationSlug, projectId ?? "", {
    enabled: Boolean(projectId),
  });
  const loadJobsFailedMessage = intl.formatMessage(jobsPageContentMessages.loadJobsFailed);
  const loadTmsJobsFailedMessage = intl.formatMessage(jobsPageContentMessages.loadTmsJobsFailed);

  const nativeJobsQueryKey = [
    "jobs",
    organizationSlug,
    "native",
    scope,
    statusFilter,
    projectId ?? "workspace",
  ] as const;
  const tmsJobsQueryKey = [
    "jobs",
    organizationSlug,
    "tms-live",
    scope,
    statusFilter,
    projectId ?? "workspace",
  ] as const;

  const nativeJobsQuery = useQuery({
    queryKey: nativeJobsQueryKey,
    enabled: !isProviderProjectScope && (scope !== "personal" || !projectId),
    queryFn: async () => {
      if (projectId) {
        return fetchNativeProjectJobs(
          organizationSlug,
          projectId,
          statusFilter,
          loadJobsFailedMessage,
        );
      }

      return fetchNativeWorkspaceJobs(organizationSlug, statusFilter, loadJobsFailedMessage);
    },
  });
  const assignedNativeJobsQuery = useQuery({
    queryKey: [...nativeJobsQueryKey, "assigned"],
    enabled: scope === "personal" && !projectId,
    queryFn: async () =>
      fetchNativeWorkspaceJobs(organizationSlug, statusFilter, loadJobsFailedMessage, "assigned"),
  });
  const createdNativeJobsQuery = useQuery({
    queryKey: [...nativeJobsQueryKey, "created"],
    enabled: scope === "personal" && !projectId,
    queryFn: async () =>
      fetchNativeWorkspaceJobs(organizationSlug, statusFilter, loadJobsFailedMessage, "created"),
  });
  const tmsJobsQuery = useQuery({
    queryKey: tmsJobsQueryKey,
    enabled: isProviderProjectScope || !projectId,
    queryFn: async () => {
      if (parsedProviderProject) {
        return fetchTmsProjectJobs(
          organizationSlug,
          parsedProviderProject.externalProjectId,
          loadTmsJobsFailedMessage,
          scope === "personal",
        );
      }

      return fetchTmsWorkspaceJobs(
        organizationSlug,
        loadTmsJobsFailedMessage,
        scope === "personal",
      );
    },
  });

  const nativeJobs = toNativeJobRows(toJobRows(nativeJobsQuery.data ?? []));
  const assignedNativeJobs = toNativeJobRows(toJobRows(assignedNativeJobsQuery.data ?? []));
  const createdNativeJobs = toNativeJobRows(toJobRows(createdNativeJobsQuery.data ?? []));
  const tmsJobs = filterJobsByStatus(toJobRows(tmsJobsQuery.data ?? []), statusFilter);

  const nativeError =
    nativeJobsQuery.error ?? assignedNativeJobsQuery.error ?? createdNativeJobsQuery.error;
  const isNativeLoading =
    scope === "personal"
      ? assignedNativeJobsQuery.isLoading || createdNativeJobsQuery.isLoading
      : nativeJobsQuery.isLoading;

  const canCreateJob = Boolean(projectId);
  const sourceLocale = projectQuery.data?.sourceLocale?.trim() || "en";
  const targetLocales = projectQuery.data?.targetLocales ?? [];

  return (
    <>
      <JobsPageView
        assignedNativeJobs={assignedNativeJobs}
        createdNativeJobs={createdNativeJobs}
        hasActiveTmsConnection={
          hasActiveTmsConnection || tmsJobsQuery.isLoading || tmsJobsQuery.isFetching
        }
        headerActions={
          canCreateJob ? (
            <Button type="button" size="sm" onClick={() => setCreateJobOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              <FormattedMessage {...jobsPageContentMessages.createJob} />
            </Button>
          ) : null
        }
        isNativeLoading={isNativeLoading}
        isProviderProjectScope={isProviderProjectScope}
        isTmsLoading={tmsJobsQuery.isLoading || tmsJobsQuery.isFetching}
        nativeError={nativeError}
        nativeJobs={nativeJobs}
        onStatusFilterChange={setStatusFilter}
        organizationSlug={organizationSlug}
        projectId={projectId}
        renderError={renderProductionJobsError}
        renderJobLink={renderProductionJobLink}
        scope={scope}
        statusFilter={statusFilter}
        tmsError={tmsJobsQuery.error}
        tmsJobs={tmsJobs}
      />
      {projectId ? (
        <CreateJobDialog
          open={createJobOpen}
          onOpenChange={setCreateJobOpen}
          organizationSlug={organizationSlug}
          projectId={projectId}
          sourceLocale={sourceLocale}
          targetLocales={targetLocales}
          onCreated={async () => {
            await Promise.all([nativeJobsQuery.refetch(), tmsJobsQuery.refetch()]);
          }}
        />
      ) : null}
    </>
  );
}
