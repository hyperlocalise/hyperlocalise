"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { readApiResponseError } from "@/lib/api-error";
import { createApiClient } from "@/lib/api-client";
import { WORKSPACE_FEATURE_UNAVAILABLE_REASON } from "@/lib/flags/workos-flag-entities";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import type { WorkspaceAutomationRunRecord } from "@/lib/agents/workspace-automations";

import { buildJobDetailHref } from "../../jobs/_components/jobs-view-helpers";
import {
  formatJobKind,
  getJobName,
  type ApiJob,
  type JobRow,
} from "../../jobs/_components/jobs-page-view";
import { mapProjectToListRow, type ProjectListRow } from "../../projects/_components/project-list";
import { providerLabel } from "../../_components/workspace-files-shared";
import { createAutomationsApi } from "../../automations/_components/automations-api";
import {
  formatDashboardLocaleRoute,
  mapDashboardAutomationRuns,
  resolveAutomationSnapshotStats,
  resolveDashboardHero,
  resolveDashboardIntegrations,
  resolveWorkspacePendingActionCount,
  sortDashboardJobs,
  sortDashboardProjects,
  type DashboardJobItem,
  type DashboardProjectItem,
} from "./dashboard-page-view-model";
import { DashboardPageView } from "./dashboard-page-view";

const api = createApiClient();
const automationsApi = createAutomationsApi(api);

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

async function fetchProjects(organizationSlug: string) {
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

async function fetchTmsConnected(organizationSlug: string, projectCount: number) {
  const response = await api.api.orgs[":organizationSlug"]["tms-provider"].connection.$get({
    param: { organizationSlug },
  });

  if (response.status === 404) {
    return projectCount > 0;
  }

  if (!response.ok) {
    throw new Error("Failed to load TMS connection");
  }

  return true;
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

function mapDashboardJobs(organizationSlug: string, jobs: readonly JobRow[]): DashboardJobItem[] {
  return sortDashboardJobs(jobs).map((job) => ({
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
): DashboardProjectItem[] {
  return sortDashboardProjects(projects)
    .slice(0, 5)
    .map((project) => ({
      id: project.id,
      name: project.name,
      sourceLabel:
        project.source === "external_tms" && project.externalProviderKind
          ? providerLabel(project.externalProviderKind)
          : "Native",
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
  const searchParams = useSearchParams();
  const handledFeatureUnavailableRef = useRef(false);

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

    toast.error("This feature is not available for your workspace yet.");
  }, [searchParams]);

  const integrationsHref = `/org/${organizationSlug}/integrations`;
  const myJobsHref = `/org/${organizationSlug}/my-jobs`;
  const newRequestHref = `/org/${organizationSlug}/chat`;

  const projectsQuery = useQuery({
    queryKey: ["dashboard-projects", organizationSlug],
    queryFn: () => fetchProjects(organizationSlug),
  });

  const jobsQuery = useQuery({
    queryKey: ["dashboard-my-jobs", organizationSlug],
    queryFn: () => fetchAssignedJobs(organizationSlug),
  });

  const slackQuery = useQuery({
    queryKey: ["dashboard-slack-connected", organizationSlug],
    queryFn: () => fetchSlackConnected(organizationSlug),
  });

  const githubQuery = useQuery({
    queryKey: ["dashboard-github-connected", organizationSlug],
    queryFn: () => fetchGithubConnected(organizationSlug),
  });

  const tmsQuery = useQuery({
    queryKey: ["dashboard-tms-connected", organizationSlug, projectsQuery.data?.length ?? 0],
    queryFn: () => fetchTmsConnected(organizationSlug, projectsQuery.data?.length ?? 0),
    enabled: projectsQuery.isFetched,
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

  const projects = projectsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const integrations = useMemo(
    () =>
      resolveDashboardIntegrations({
        tmsConnected: tmsQuery.data ?? false,
        githubConnected: githubQuery.data ?? false,
        slackConnected: slackQuery.data ?? false,
      }),
    [githubQuery.data, slackQuery.data, tmsQuery.data],
  );

  const pendingCount = useMemo(
    () =>
      resolveWorkspacePendingActionCount({
        projects,
        jobs: jobs as readonly ApiJob[],
      }),
    [jobs, projects],
  );

  const hero = useMemo(
    () =>
      resolveDashboardHero({
        integrations,
        projectCount: projects.length,
        pendingCount,
        integrationsHref,
        myJobsHref,
        newRequestHref,
      }),
    [
      integrations,
      integrationsHref,
      myJobsHref,
      newRequestHref,
      organizationSlug,
      pendingCount,
      projects.length,
    ],
  );

  const automationStats = useMemo(
    () => resolveAutomationSnapshotStats(automationsQuery.data ?? []),
    [automationsQuery.data],
  );

  const automationRuns = useMemo(
    () =>
      mapDashboardAutomationRuns({
        organizationSlug,
        automations: automationsQuery.data ?? [],
        runs: automationRunsQuery.data ?? [],
        limit: 5,
      }),
    [automationRunsQuery.data, automationsQuery.data, organizationSlug],
  );

  const mappedJobs = useMemo(
    () => mapDashboardJobs(organizationSlug, jobs),
    [organizationSlug, jobs],
  );

  const mappedProjects = useMemo(
    () => mapDashboardProjects(organizationSlug, projects),
    [organizationSlug, projects],
  );

  return (
    <DashboardPageView
      organizationSlug={organizationSlug}
      hero={hero}
      integrations={integrations}
      jobs={mappedJobs}
      projects={mappedProjects}
      automationStats={automationStats}
      automationRuns={automationRuns}
      automationsEnabled={automationsEnabled}
      isIntegrationsLoading={
        slackQuery.isLoading ||
        githubQuery.isLoading ||
        tmsQuery.isLoading ||
        projectsQuery.isLoading
      }
      isJobsLoading={jobsQuery.isLoading}
      isJobsError={jobsQuery.isError}
      isProjectsLoading={projectsQuery.isLoading}
      isProjectsError={projectsQuery.isError}
      isAutomationsLoading={automationsQuery.isLoading || automationRunsQuery.isLoading}
      isAutomationsError={automationsQuery.isError || automationRunsQuery.isError}
      renderLink={({ href, className, children }) => (
        <Link href={href} className={className}>
          {children}
        </Link>
      )}
    />
  );
}
