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
import type { IntlShape } from "react-intl";

import type { WorkspaceAutomationRunRecord } from "@/lib/agents/workspace-automation-types";
import { getIntlShape } from "@/lib/app-i18n/intl";
import type { WorkspaceOverviewSnapshot } from "@/lib/workspace/overview-snapshot-model";

import { automationsFixture } from "../../automations/_components/automations.fixture";
import type { ApiJob } from "../../jobs/_components/jobs-page-view";
import {
  projectOverviewCaughtUpFixture,
  projectOverviewFixture,
} from "../../projects/[projectId]/_components/project-overview.fixture";
import type { ProjectListRow } from "../../projects/_components/project-list";
import { providerLabel } from "../../_components/workspace-files-shared";

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
const intl = getIntlShape("en") as IntlShape;

export const dashboardIntegrationsCompleteFixture: DashboardIntegrationItem[] =
  resolveDashboardIntegrations(intl, {
    tmsConnected: true,
    githubConnected: true,
    slackConnected: true,
  });

export const dashboardIntegrationsIncompleteFixture: DashboardIntegrationItem[] =
  resolveDashboardIntegrations(intl, {
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
    sourceLabel:
      project.source === "external_tms" && project.externalProviderKind
        ? providerLabel(project.externalProviderKind)
        : "Workspace",
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
  mapDashboardAutomationRuns(intl, {
    organizationSlug,
    automations: automationsFixture,
    runs: automationRunsFixture,
    limit: 5,
  });

export const dashboardOverviewFixture: WorkspaceOverviewSnapshot = {
  metrics: {
    jobs: { count: 48, series: [4, 6, 5, 8, 7, 9, 9] },
    translations: { count: 312, series: [20, 35, 40, 48, 52, 55, 62] },
    automations: { total: 6, paused: 1 },
    issues: { open: 9, p1: 2 },
  },
  activity: [
    {
      id: "job_failed_sync",
      kind: "job",
      title: "push github",
      subtitle: "Help center · sync",
      status: "failed",
      href: `/org/${organizationSlug}/projects/project_docs/jobs/job_failed_sync`,
      updatedAt: "2026-03-17T18:00:00.000Z",
      attention: true,
    },
    {
      id: "job_review_fr",
      kind: "job",
      title: "Review: terminology consistency",
      subtitle: "Website localization · review",
      status: "waiting_for_review",
      href: `/org/${organizationSlug}/projects/project_website/jobs/job_review_fr`,
      updatedAt: "2026-03-18T12:15:00.000Z",
      attention: false,
    },
    {
      id: "job_translate_home",
      kind: "job",
      title: "marketing/home.json",
      subtitle: "Website localization · file",
      status: "running",
      href: `/org/${organizationSlug}/projects/project_website/jobs/job_translate_home`,
      updatedAt: "2026-03-18T10:30:00.000Z",
      attention: false,
    },
    {
      id: "run_001",
      kind: "automation",
      title: automationsFixture[0]!.name,
      subtitle: "Automation",
      status: "succeeded",
      href: `/org/${organizationSlug}/automations/${automationsFixture[0]!.id}`,
      updatedAt: "2026-06-07T12:00:00.000Z",
      attention: false,
    },
  ],
  projects: dashboardProjectsItemsFixture.slice(0, 2).map((project) => ({
    id: project.id,
    name: project.name,
    subtitle: `${project.sourceLabel}`,
    localeRoute: project.localeRoute,
    latestJobTitle: "Review: terminology consistency",
    latestJobAt: "2026-03-18T12:15:00.000Z",
    openCount: project.pendingActionCount,
    failedCount: project.id === "project_docs" ? 1 : 0,
    href: project.href,
  })),
  board: [
    {
      id: "issue_1",
      identifier: "WEB-1",
      title: "Missing CTA on checkout",
      projectName: "Website localization",
      locale: "fr-FR",
      priority: "P1",
      updatedAt: "2026-03-18T11:45:00.000Z",
      href: `/org/${organizationSlug}/projects/project_website/issue-sheet/issue_1`,
    },
    {
      id: "issue_2",
      identifier: "WEB-2",
      title: "Date format uses US month-first",
      projectName: "Website localization",
      locale: "ja-JP",
      priority: "P2",
      updatedAt: "2026-03-18T09:00:00.000Z",
      href: `/org/${organizationSlug}/projects/project_website/issue-sheet/issue_2`,
    },
    {
      id: "issue_3",
      identifier: "MOB-4",
      title: "Truncated string in onboarding",
      projectName: "Mobile app strings",
      locale: "ko-KR",
      priority: "P1",
      updatedAt: "2026-03-17T16:20:00.000Z",
      href: `/org/${organizationSlug}/projects/project_mobile/issue-sheet/issue_3`,
    },
  ],
  automations: [
    {
      id: "run_001",
      automationId: automationsFixture[0]!.id,
      name: automationsFixture[0]!.name,
      triggerSource: "github",
      status: "succeeded",
      updatedAt: "2026-06-07T12:00:00.000Z",
      href: `/org/${organizationSlug}/automations/${automationsFixture[0]!.id}`,
    },
    {
      id: "run_002",
      automationId: automationsFixture[1]!.id,
      name: automationsFixture[1]!.name,
      triggerSource: "scheduled",
      status: "failed",
      updatedAt: "2026-06-06T09:04:00.000Z",
      href: `/org/${organizationSlug}/automations/${automationsFixture[1]!.id}`,
    },
    {
      id: "run_003",
      automationId: automationsFixture[0]!.id,
      name: automationsFixture[0]!.name,
      triggerSource: "manual",
      status: "running",
      updatedAt: "2026-06-05T14:00:00.000Z",
      href: `/org/${organizationSlug}/automations/${automationsFixture[0]!.id}`,
    },
  ],
};

export const dashboardOverviewEmptyFixture: WorkspaceOverviewSnapshot = {
  metrics: {
    jobs: { count: 0, series: [0, 0, 0, 0, 0, 0, 0] },
    translations: { count: 0, series: [0, 0, 0, 0, 0, 0, 0] },
    automations: { total: 0, paused: 0 },
    issues: { open: 0, p1: 0 },
  },
  activity: [],
  projects: [],
  board: [],
  automations: [],
};

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
