import type { WorkspaceAutomationRunRecord } from "@/lib/agents/workspace-automations";

import { automationsFixture } from "../../automations/_components/automations.fixture";
import type { ApiJob } from "../../jobs/_components/jobs-page-view";
import {
  projectOverviewCaughtUpFixture,
  projectOverviewFixture,
} from "../../projects/[projectId]/_components/project-overview.fixture";
import type { ProjectListRow } from "../../projects/_components/project-list";

import type {
  DashboardAutomationRunItem,
  DashboardIntegrationItem,
  DashboardJobItem,
  DashboardProjectItem,
} from "./dashboard-page-view-model";
import {
  formatDashboardLocaleRoute,
  mapDashboardAutomationRuns,
  resolveDashboardIntegrations,
} from "./dashboard-page-view-model";

const organizationSlug = "acme";

export const dashboardIntegrationsCompleteFixture: DashboardIntegrationItem[] =
  resolveDashboardIntegrations({
    tmsConnected: true,
    githubConnected: true,
    slackConnected: true,
  });

export const dashboardIntegrationsIncompleteFixture: DashboardIntegrationItem[] =
  resolveDashboardIntegrations({
    tmsConnected: false,
    githubConnected: false,
    slackConnected: true,
  });

export const dashboardProjectsFixture: ProjectListRow[] = [
  projectOverviewFixture,
  {
    ...projectOverviewCaughtUpFixture,
    id: "project_mobile",
    name: "Mobile app strings",
    key: "mobile",
    source: "native",
    externalProviderKind: null,
    externalProjectId: null,
    externalProjectUrl: null,
    sourceLocale: "en",
    targetLocales: ["ja-JP", "ko-KR"],
    openJobCount: 0,
    updated: "Mar 20, 2026, 11:00 AM",
  },
  {
    ...projectOverviewFixture,
    id: "project_docs",
    name: "Help center",
    key: "docs",
    externalProviderKind: "lokalise",
    openJobCount: 1,
    updated: "Mar 19, 2026, 4:45 PM",
  },
  {
    ...projectOverviewFixture,
    id: "project_email",
    name: "Lifecycle email",
    key: "email",
    source: "native",
    externalProviderKind: null,
    openJobCount: 0,
    updated: "Mar 10, 2026, 9:15 AM",
  },
  {
    ...projectOverviewFixture,
    id: "project_legal",
    name: "Legal pages",
    key: "legal",
    openJobCount: 0,
    updated: "Feb 28, 2026, 1:00 PM",
  },
];

function createDashboardJob(
  overrides: Partial<ApiJob & { projectName: string | null }>,
): ApiJob & { projectName: string | null } {
  return {
    id: "job_default",
    projectId: "project_website",
    createdByUserId: "user_1",
    kind: "translation",
    type: "file",
    status: "running",
    createdAt: "2026-03-18T08:00:00.000Z",
    updatedAt: "2026-03-18T10:30:00.000Z",
    completedAt: null,
    workflowRunId: null,
    lastError: null,
    inputPayload: { sourceFileId: "marketing/home.json" },
    outcomeKind: null,
    outcomePayload: null,
    reviewCriteria: null,
    reviewTargetLocale: null,
    syncConnectorKind: null,
    syncDirection: null,
    assetType: null,
    assetOperation: null,
    externalProviderKind: null,
    externalJobId: null,
    externalTaskId: null,
    externalStatus: null,
    externalTitle: null,
    externalDueDate: null,
    externalTargetLocales: null,
    externalAssignedUsers: null,
    externalSyncState: null,
    projectName: "Website localization",
    ...overrides,
  };
}

export const dashboardJobsFixture: DashboardJobItem[] = [
  {
    id: "job_review_fr",
    name: "Review: terminology consistency",
    projectName: "Website localization",
    kindLabel: "review",
    status: "waiting_for_review",
    updatedAt: "2026-03-18T12:15:00.000Z",
    href: `/org/${organizationSlug}/projects/project_website/jobs/job_review_fr`,
  },
  {
    id: "job_translate_home",
    name: "marketing/home.json",
    projectName: "Website localization",
    kindLabel: "translation · file",
    status: "running",
    updatedAt: "2026-03-18T10:30:00.000Z",
    href: `/org/${organizationSlug}/projects/project_website/jobs/job_translate_home`,
  },
  {
    id: "job_failed_sync",
    name: "push github",
    projectName: "Help center",
    kindLabel: "sync",
    status: "failed",
    updatedAt: "2026-03-17T18:00:00.000Z",
    href: `/org/${organizationSlug}/projects/project_docs/jobs/job_failed_sync`,
  },
  ...Array.from({ length: 7 }).map((_, index) => ({
    id: `job_history_${index}`,
    name: `Completed string batch ${index + 1}`,
    projectName: "Website localization",
    kindLabel: "translation · string",
    status: "succeeded" as const,
    updatedAt: new Date(Date.UTC(2026, 2, 10 - index, 9, 0, 0)).toISOString(),
    href: `/org/${organizationSlug}/projects/project_website/jobs/job_history_${index}`,
  })),
];

export const dashboardProjectsItemsFixture: DashboardProjectItem[] = dashboardProjectsFixture
  .slice(0, 5)
  .map((project) => ({
    id: project.id,
    name: project.name,
    sourceLabel: project.externalProviderKind ?? "Native",
    localeRoute: formatDashboardLocaleRoute(project.sourceLocale, project.targetLocales),
    pendingActionCount: project.openJobCount,
    updatedAt: project.lastSyncedAt ?? project.updated,
    href: `/org/${organizationSlug}/projects/${project.id}`,
  }));

const automationRunsFixture: WorkspaceAutomationRunRecord[] = [
  {
    id: "run_001",
    automationId: automationsFixture[0]!.id,
    organizationId: "org_001",
    triggerSource: "github",
    status: "succeeded",
    idempotencyKey: null,
    inputSnapshot: {},
    outputSummary: { validatedFiles: 12 },
    error: null,
    githubRepositoryAutomationJobId: null,
    startedAt: "2026-06-07T11:55:00.000Z",
    completedAt: "2026-06-07T12:00:00.000Z",
    createdAt: "2026-06-07T11:55:00.000Z",
    updatedAt: "2026-06-07T12:00:00.000Z",
  },
  {
    id: "run_002",
    automationId: automationsFixture[1]!.id,
    organizationId: "org_001",
    triggerSource: "scheduled",
    status: "failed",
    idempotencyKey: null,
    inputSnapshot: {},
    outputSummary: {},
    error: { message: "GitHub sync failed" },
    githubRepositoryAutomationJobId: null,
    startedAt: "2026-06-06T09:00:00.000Z",
    completedAt: "2026-06-06T09:04:00.000Z",
    createdAt: "2026-06-06T09:00:00.000Z",
    updatedAt: "2026-06-06T09:04:00.000Z",
  },
  {
    id: "run_003",
    automationId: automationsFixture[0]!.id,
    organizationId: "org_001",
    triggerSource: "manual",
    status: "running",
    idempotencyKey: "manual-1",
    inputSnapshot: {},
    outputSummary: {},
    error: null,
    githubRepositoryAutomationJobId: null,
    startedAt: "2026-06-05T14:00:00.000Z",
    completedAt: null,
    createdAt: "2026-06-05T14:00:00.000Z",
    updatedAt: "2026-06-05T14:00:00.000Z",
  },
];

export const dashboardAutomationRunsFixture: DashboardAutomationRunItem[] =
  mapDashboardAutomationRuns({
    organizationSlug,
    automations: automationsFixture,
    runs: automationRunsFixture,
    limit: 5,
  });

export const dashboardJobsSourceFixture = dashboardJobsFixture.map((job) =>
  createDashboardJob({
    id: job.id,
    status: job.status,
    updatedAt: job.updatedAt,
    projectName: job.projectName,
    kind: job.kindLabel.startsWith("review")
      ? "review"
      : job.kindLabel.startsWith("sync")
        ? "sync"
        : "translation",
    type: job.kindLabel.includes("file")
      ? "file"
      : job.kindLabel.includes("string")
        ? "string"
        : null,
    reviewCriteria: job.name.startsWith("Review:") ? "terminology consistency" : null,
    syncConnectorKind: job.kindLabel === "sync" ? "github" : null,
    syncDirection: job.kindLabel === "sync" ? "push" : null,
    inputPayload:
      job.name === "marketing/home.json" ? { sourceFileId: job.name } : { sourceText: job.name },
  }),
);
