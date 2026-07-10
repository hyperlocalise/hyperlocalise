"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { readApiResponseError } from "@/lib/api-error";
import { createApiClient } from "@/lib/api-client";
import { WORKSPACE_FEATURE_UNAVAILABLE_REASON } from "@/lib/flags/workos-flag-entities";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isNativeWorkspaceJob } from "@/lib/projects/workspace-resource-capabilities";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";
import { readTmsProviderListResponse } from "@/lib/providers/jobs/tms-provider-list-fetch";
import type { WorkspaceAutomationRunRecord } from "@/lib/agents/workspace-automations";

import { buildJobDetailHref } from "../../jobs/_components/jobs-view-helpers";
import {
  formatJobKind,
  getJobName,
  type ApiJob,
  type JobRow,
} from "../../jobs/_components/jobs-page-view";
import { mapProjectToListRow, type ProjectListRow } from "../../projects/_components/project-list";
import {
  readRecentProjectVisits,
  type RecentProjectVisit,
} from "../../projects/_components/recent-projects";
import { useActiveTmsProvider } from "../../_hooks/use-active-tms-provider";
import { fetchTmsLiveProjects, tmsLiveProjectsQueryKey } from "../../_hooks/use-tms-live-projects";
import { providerLabel } from "../../_components/workspace-files-shared";
import { createAutomationsApi } from "../../automations/_components/automations-api";
import {
  formatDashboardLocaleRoute,
  mapDashboardAutomationRuns,
  mergeDashboardJobSources,
  mergeDashboardProjectSources,
  resolveAutomationSnapshotStats,
  resolveDashboardHero,
  resolveDashboardIntegrations,
  resolveWorkspacePendingActionCount,
  sortDashboardJobs,
  sortDashboardLatestJobs,
  sortDashboardProjects,
  type DashboardJobItem,
  type DashboardProjectItem,
} from "./dashboard-page-view-model";
import { dashboardPageContentMessages } from "./dashboard-page-content.messages";
import { dashboardPageViewModelMessages } from "./dashboard-page-view-model.messages";
import { DashboardPageView } from "./dashboard-page-view";

const api = createApiClient();
const automationsApi = createAutomationsApi(api);

/** Workspace jobs can include synced TMS rows; fetch extra so five native jobs remain after filtering. */
const DASHBOARD_NATIVE_JOB_FETCH_LIMIT = "100";

async function fetchAssignedJobs(organizationSlug: string) {
  const response = await api.api.orgs[":organizationSlug"].jobs.$get({
    param: { organizationSlug },
    query: {
      limit: "10",
      relationship: "assigned",
    },
  });

  if (!response.ok) {
    throw await readApiResponseError(response, "Failed to load my jobs");
  }

  const body = (await response.json()) as { jobs: JobRow[] };
  return body.jobs;
}

async function fetchLatestJobs(organizationSlug: string) {
  const response = await api.api.orgs[":organizationSlug"].jobs.$get({
    param: { organizationSlug },
    query: {
      limit: DASHBOARD_NATIVE_JOB_FETCH_LIMIT,
    },
  });

  if (!response.ok) {
    throw await readApiResponseError(response, "Failed to load latest jobs");
  }

  const body = (await response.json()) as { jobs: JobRow[] };
  return body.jobs;
}

async function fetchTmsJobs(organizationSlug: string, mine: boolean) {
  const response = await api.api.orgs[":organizationSlug"]["tms-provider"].jobs.$get({
    param: { organizationSlug },
    query: { mine: mine ? "true" : "false" },
  });

  return readTmsProviderListResponse<JobRow>(
    response,
    "jobs",
    mine ? "Failed to load assigned TMS jobs" : "Failed to load latest TMS jobs",
  );
}

async function fetchNativeProjects(organizationSlug: string) {
  const response = await api.api.orgs[":organizationSlug"].projects.$get({
    param: { organizationSlug },
  });

  if (response.status !== 200) {
    throw await readApiResponseError(response, "Failed to load projects");
  }

  const body = await response.json();
  return body.projects.map(mapProjectToListRow);
}

async function fetchSlackConnected(organizationSlug: string) {
  const response = await api.api.orgs[":organizationSlug"]["agent-slack"].$get({
    param: { organizationSlug },
  });

  if (!response.ok) {
    throw new Error("Failed to load Slack connection");
  }

  const body = await response.json();
  return Boolean(body.slackAgent.teamId);
}

async function fetchGithubConnected(organizationSlug: string) {
  const response = await api.api.orgs[":organizationSlug"]["github-installation"].$get({
    param: { organizationSlug },
  });

  if (!response.ok) {
    throw new Error("Failed to load GitHub installation");
  }

  const body = (await response.json()) as { installation: Record<string, unknown> | null };
  return body.installation !== null;
}

async function fetchRecentAutomationRuns(
  organizationSlug: string,
  automationIds: string[],
): Promise<WorkspaceAutomationRunRecord[]> {
  const runsByAutomation = await mapWithConcurrency(automationIds, 3, async (automationId) => {
    const response = await api.api.orgs[":organizationSlug"].automations[":automationId"].runs.$get(
      {
        param: { organizationSlug, automationId },
        query: { limit: "5", offset: "0" },
      },
    );

    if (!response.ok) {
      return [] as WorkspaceAutomationRunRecord[];
    }

    const body = (await response.json()) as { automationRuns: WorkspaceAutomationRunRecord[] };
    return body.automationRuns;
  });

  return runsByAutomation.flat();
}

function mapDashboardJobs(
  organizationSlug: string,
  jobs: readonly JobRow[],
  order: "priority" | "latest",
): DashboardJobItem[] {
  const sortedJobs = order === "priority" ? sortDashboardJobs(jobs) : sortDashboardLatestJobs(jobs);

  return sortedJobs.slice(0, 5).map((job) => ({
    id: job.id,
    name: getJobName(job),
    projectName: job.projectName,
    kindLabel: formatJobKind(job),
    status: job.status,
    updatedAt: job.updatedAt,
    href: buildJobDetailHref(organizationSlug, job.projectId, job.id),
  }));
}

function mapDashboardProjects(
  organizationSlug: string,
  projects: readonly ProjectListRow[],
  recentProjectVisits: readonly RecentProjectVisit[],
  nativeSourceLabel: string,
): DashboardProjectItem[] {
  return sortDashboardProjects(projects, recentProjectVisits)
    .slice(0, 5)
    .map((project) => ({
      id: project.id,
      name: project.name,
      sourceLabel:
        project.source === "external_tms" && project.externalProviderKind
          ? providerLabel(project.externalProviderKind)
          : nativeSourceLabel,
      localeRoute: formatDashboardLocaleRoute(project.sourceLocale, project.targetLocales),
      pendingActionCount: project.openJobCount,
      updatedAt: project.lastSyncedAt ?? project.updated,
      href: `/org/${organizationSlug}/projects/${encodeURIComponent(project.id)}`,
    }));
}

export function DashboardPageContent({
  organizationSlug,
  automationsEnabled = false,
}: {
  organizationSlug: string;
  automationsEnabled?: boolean;
}) {
  const intl = useIntl();
  const searchParams = useSearchParams();
  const handledFeatureUnavailableRef = useRef(false);
  const [recentProjectVisits, setRecentProjectVisits] = useState<RecentProjectVisit[] | null>(null);

  useEffect(() => {
    if (
      searchParams.get("reason") !== WORKSPACE_FEATURE_UNAVAILABLE_REASON ||
      handledFeatureUnavailableRef.current
    ) {
      return;
    }

    handledFeatureUnavailableRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("reason");
    window.history.replaceState(null, "", url.toString());

    toast.error(intl.formatMessage(dashboardPageContentMessages.featureUnavailable));
  }, [intl, searchParams]);

  useEffect(() => {
    setRecentProjectVisits(readRecentProjectVisits(organizationSlug));
  }, [organizationSlug]);

  const integrationsHref = `/org/${organizationSlug}/integrations`;
  const myJobsHref = `/org/${organizationSlug}/my-jobs`;
  const newRequestHref = `/org/${organizationSlug}/chat`;

  const activeTmsProviderQuery = useActiveTmsProvider(organizationSlug);
  const activeTmsProvider = activeTmsProviderQuery.data;
  const hasTmsConnection = Boolean(activeTmsProvider);

  const nativeProjectsQuery = useQuery({
    queryKey: ["dashboard-projects", organizationSlug],
    queryFn: () => fetchNativeProjects(organizationSlug),
  });

  const assignedJobsQuery = useQuery({
    queryKey: ["dashboard-my-jobs", organizationSlug],
    queryFn: () => fetchAssignedJobs(organizationSlug),
  });

  const latestJobsQuery = useQuery({
    queryKey: ["dashboard-latest-jobs", organizationSlug],
    queryFn: () => fetchLatestJobs(organizationSlug),
  });

  const assignedTmsJobsQuery = useQuery({
    queryKey: ["dashboard-my-jobs", organizationSlug, "tms-live"],
    queryFn: () => fetchTmsJobs(organizationSlug, true),
    enabled: hasTmsConnection,
  });

  const latestTmsJobsQuery = useQuery({
    queryKey: ["dashboard-latest-jobs", organizationSlug, "tms-live"],
    queryFn: () => fetchTmsJobs(organizationSlug, false),
    enabled: hasTmsConnection,
  });

  const slackQuery = useQuery({
    queryKey: ["dashboard-slack-connected", organizationSlug],
    queryFn: () => fetchSlackConnected(organizationSlug),
  });

  const githubQuery = useQuery({
    queryKey: ["dashboard-github-connected", organizationSlug],
    queryFn: () => fetchGithubConnected(organizationSlug),
  });

  const tmsProjectsQuery = useQuery({
    queryKey: tmsLiveProjectsQueryKey(organizationSlug),
    queryFn: () => fetchTmsLiveProjects(organizationSlug),
    select: (projects) => projects.map(mapProjectToListRow),
    enabled: hasTmsConnection,
  });

  const automationsQuery = useQuery({
    queryKey: ["dashboard-automations", organizationSlug],
    queryFn: () => automationsApi.listAutomations(organizationSlug),
    enabled: automationsEnabled,
  });

  const automationRunsQuery = useQuery({
    queryKey: [
      "dashboard-automation-runs",
      organizationSlug,
      automationsQuery.data?.map((automation) => automation.id).join(",") ?? "",
    ],
    queryFn: async () => {
      const automations = automationsQuery.data ?? [];
      const activeAutomationIds = automations
        .filter((automation) => automation.status === "active")
        .slice(0, 3)
        .map((automation) => automation.id);

      if (activeAutomationIds.length === 0) {
        return [];
      }

      return fetchRecentAutomationRuns(organizationSlug, [...activeAutomationIds]);
    },
    enabled: automationsEnabled && automationsQuery.isSuccess,
  });

  const allProjects = useMemo(
    () => mergeDashboardProjectSources(nativeProjectsQuery.data ?? [], tmsProjectsQuery.data ?? []),
    [nativeProjectsQuery.data, tmsProjectsQuery.data],
  );
  const assignedJobs = useMemo(
    () =>
      mergeDashboardJobSources(
        (assignedJobsQuery.data ?? []).filter(isNativeWorkspaceJob),
        assignedTmsJobsQuery.data ?? [],
      ),
    [assignedJobsQuery.data, assignedTmsJobsQuery.data],
  );
  const latestJobs = useMemo(
    () => (latestJobsQuery.data ?? []).filter(isNativeWorkspaceJob),
    [latestJobsQuery.data],
  );
  const tmsBranding = getTmsProviderBranding(activeTmsProvider?.providerKind);
  const integrations = useMemo(
    () =>
      resolveDashboardIntegrations(intl, {
        tmsConnected: hasTmsConnection,
        tmsProviderKind: activeTmsProvider?.providerKind,
        tmsProviderName: hasTmsConnection ? tmsBranding.name : undefined,
        githubConnected: githubQuery.data ?? false,
        slackConnected: slackQuery.data ?? false,
      }),
    [
      activeTmsProvider?.providerKind,
      githubQuery.data,
      hasTmsConnection,
      intl,
      slackQuery.data,
      tmsBranding.name,
    ],
  );

  const pendingCount = useMemo(
    () =>
      resolveWorkspacePendingActionCount({
        projects: allProjects,
        jobs: assignedJobs as readonly ApiJob[],
      }),
    [allProjects, assignedJobs],
  );

  const hero = useMemo(
    () =>
      resolveDashboardHero(intl, {
        integrations,
        projectCount: allProjects.length,
        pendingCount,
        integrationsHref,
        myJobsHref,
        newRequestHref,
      }),
    [
      allProjects.length,
      integrations,
      integrationsHref,
      intl,
      myJobsHref,
      newRequestHref,
      pendingCount,
    ],
  );

  const automationStats = useMemo(
    () => resolveAutomationSnapshotStats(automationsQuery.data ?? []),
    [automationsQuery.data],
  );

  const automationRuns = useMemo(
    () =>
      mapDashboardAutomationRuns(intl, {
        organizationSlug,
        automations: automationsQuery.data ?? [],
        runs: automationRunsQuery.data ?? [],
        limit: 5,
      }),
    [automationRunsQuery.data, automationsQuery.data, intl, organizationSlug],
  );

  const mappedJobs = useMemo(
    () => mapDashboardJobs(organizationSlug, assignedJobs, "priority"),
    [assignedJobs, organizationSlug],
  );

  const mappedLatestJobs = useMemo(
    () => mapDashboardJobs(organizationSlug, latestJobs, "latest"),
    [latestJobs, organizationSlug],
  );

  const mappedTmsJobs = useMemo(
    () => mapDashboardJobs(organizationSlug, latestTmsJobsQuery.data ?? [], "latest"),
    [latestTmsJobsQuery.data, organizationSlug],
  );

  const nativeSourceLabel = intl.formatMessage(dashboardPageViewModelMessages.nativeSourceLabel);

  const mappedProjects = useMemo(
    () =>
      recentProjectVisits
        ? mapDashboardProjects(
            organizationSlug,
            nativeProjectsQuery.data ?? [],
            recentProjectVisits,
            nativeSourceLabel,
          )
        : [],
    [nativeProjectsQuery.data, nativeSourceLabel, organizationSlug, recentProjectVisits],
  );

  const mappedTmsProjects = useMemo(
    () =>
      recentProjectVisits
        ? mapDashboardProjects(
            organizationSlug,
            tmsProjectsQuery.data ?? [],
            recentProjectVisits,
            nativeSourceLabel,
          )
        : [],
    [nativeSourceLabel, organizationSlug, recentProjectVisits, tmsProjectsQuery.data],
  );

  const isSetupLoading =
    nativeProjectsQuery.isLoading ||
    activeTmsProviderQuery.isLoading ||
    (hasTmsConnection && tmsProjectsQuery.isLoading) ||
    slackQuery.isLoading ||
    githubQuery.isLoading;
  return (
    <DashboardPageView
      organizationSlug={organizationSlug}
      hero={hero}
      isHeroLoading={isSetupLoading}
      integrations={integrations}
      jobs={mappedJobs}
      latestJobs={mappedLatestJobs}
      projects={mappedProjects}
      showTmsSections={hasTmsConnection}
      tmsProviderName={tmsBranding.name}
      tmsJobs={mappedTmsJobs}
      tmsProjects={mappedTmsProjects}
      automationStats={automationStats}
      automationRuns={automationRuns}
      automationsEnabled={automationsEnabled}
      isIntegrationsLoading={
        slackQuery.isLoading || githubQuery.isLoading || activeTmsProviderQuery.isLoading
      }
      isJobsLoading={
        assignedJobsQuery.isLoading || (hasTmsConnection && assignedTmsJobsQuery.isLoading)
      }
      isJobsError={assignedJobsQuery.isError && (!hasTmsConnection || assignedTmsJobsQuery.isError)}
      jobsWarning={
        assignedTmsJobsQuery.isError && !assignedJobsQuery.isError
          ? intl.formatMessage(dashboardPageContentMessages.liveTmsJobsWarning)
          : assignedJobsQuery.isError && assignedTmsJobsQuery.isSuccess
            ? intl.formatMessage(dashboardPageContentMessages.nativeJobsWarning)
            : undefined
      }
      isLatestJobsLoading={latestJobsQuery.isLoading}
      isLatestJobsError={latestJobsQuery.isError}
      isProjectsLoading={nativeProjectsQuery.isLoading || recentProjectVisits === null}
      isProjectsError={nativeProjectsQuery.isError}
      isTmsJobsLoading={hasTmsConnection && latestTmsJobsQuery.isLoading}
      isTmsJobsError={latestTmsJobsQuery.isError}
      isTmsProjectsLoading={
        hasTmsConnection && (tmsProjectsQuery.isLoading || recentProjectVisits === null)
      }
      isTmsProjectsError={tmsProjectsQuery.isError}
      isAutomationsLoading={automationsQuery.isLoading || automationRunsQuery.isLoading}
      isAutomationsError={automationsQuery.isError || automationRunsQuery.isError}
      renderLink={({ href, className, children, onClick }) => (
        <Link href={href} className={className} onClick={onClick}>
          {children}
        </Link>
      )}
    />
  );
}
