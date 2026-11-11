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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { JobsPageView, type JobRow } from "./jobs-page-view";

const fixedNow = Date.UTC(2026, 5, 6, 12, 0, 0);

function iso(offsetMs: number) {
  return new Date(fixedNow + offsetMs).toISOString();
}

function createJob(overrides: Partial<JobRow>): JobRow {
  return {
    id: "job_001",
    projectId: "project_website",
    projectName: "Website",
    createdByUserId: "user_001",
    kind: "translation",
    type: "file",
    status: "running",
    createdAt: iso(-3_600_000),
    updatedAt: iso(-600_000),
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
    externalProviderKind: "crowdin",
    externalTaskId: "CR-1204",
    externalStatus: "in_progress",
    externalTitle: "Translate marketing homepage",
    externalDueDate: iso(86_400_000),
    externalTargetLocales: ["fr-FR", "de-DE"],
    externalAssignedUsers: ["Mina", "Otto"],
    externalSyncState: "synced",
    ...overrides,
  };
}

const tmsJobs: JobRow[] = [
  createJob({ id: "job_translate_homepage", status: "running" }),
  createJob({
    id: "job_review_checkout",
    kind: "review",
    type: null,
    status: "waiting_for_review",
    externalTitle: "Review checkout strings",
    externalTaskId: "CR-1205",
    externalTargetLocales: ["ja-JP"],
    externalAssignedUsers: ["Aiko"],
    externalDueDate: iso(172_800_000),
    updatedAt: iso(-1_800_000),
  }),
];

const nativeJobs: JobRow[] = [
  createJob({
    id: "job_sync_mobile",
    kind: "sync",
    type: null,
    status: "succeeded",
    projectId: "project_mobile",
    projectName: "Mobile app",
    externalProviderKind: null,
    externalTaskId: null,
    externalTitle: null,
    externalTargetLocales: null,
    externalAssignedUsers: null,
    syncConnectorKind: "crowdin",
    syncDirection: "pull",
    updatedAt: iso(-7_200_000),
  }),
];

const meta = {
  title: "App/Jobs/Page",
  component: JobsPageView,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof JobsPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WorkspaceJobs: Story = {
  args: {
    organizationSlug: "acme",
    nativeJobs,
    tmsJobs,
    hasActiveTmsConnection: true,
    isNativeLoading: false,
    isTmsLoading: false,
    now: fixedNow,
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Jobs" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    await expect(canvas.getByText("Translate marketing homepage")).toBeInTheDocument();
    await expect(canvas.getByText("Running")).toBeInTheDocument();
    await expect(canvas.getByText("Waiting for review")).toBeInTheDocument();
    await expect(canvasElement.querySelector("table")).toBeNull();
  },
};

export const MyJobs: Story = {
  args: {
    organizationSlug: "acme",
    scope: "personal",
    assignedNativeJobs: [],
    createdNativeJobs: [
      createJob({
        id: "job_created_mobile",
        status: "queued",
        projectId: "project_mobile",
        projectName: "Mobile app",
        externalProviderKind: null,
        externalTaskId: null,
        externalTitle: null,
        externalTargetLocales: null,
        externalAssignedUsers: null,
        updatedAt: iso(-900_000),
      }),
    ],
    nativeJobs: [],
    tmsJobs: tmsJobs.slice(0, 2),
    hasActiveTmsConnection: true,
    isNativeLoading: false,
    isTmsLoading: false,
    now: fixedNow,
  },
};

export const ProjectJobs: Story = {
  args: {
    organizationSlug: "acme",
    projectId: "project_website",
    isProviderProjectScope: true,
    nativeJobs: [],
    tmsJobs: tmsJobs.slice(0, 2),
    hasActiveTmsConnection: true,
    isNativeLoading: false,
    isTmsLoading: false,
    now: fixedNow,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Row" }));
    await expect(canvas.getByRole("button", { name: "Board" })).toBeInTheDocument();
    await expect(canvas.getAllByRole("link", { name: "Open Editor" }).length).toBeGreaterThan(0);
    await expect(canvas.getAllByRole("link", { name: "Details" }).length).toBeGreaterThan(0);
  },
};

const boardJobs: JobRow[] = [
  createJob({
    id: "job_queued_legal",
    status: "queued",
    externalTitle: "Translate legal terms update",
    externalTaskId: "CR-1210",
    externalTargetLocales: ["fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR"],
    externalAssignedUsers: ["Lena Fischer"],
    externalDueDate: iso(5 * 86_400_000),
  }),
  createJob({
    id: "job_queued_undated",
    status: "queued",
    externalTitle: "Localize onboarding emails",
    externalTaskId: "CR-1211",
    externalTargetLocales: ["ja-JP"],
    externalAssignedUsers: null,
    externalDueDate: null,
  }),
  ...tmsJobs,
  createJob({
    id: "job_running_overdue",
    status: "running",
    externalTitle: "Pricing page refresh for Q3 launch campaign across all regions",
    externalTaskId: "CR-1199",
    externalTargetLocales: ["ko-KR", "zh-CN"],
    externalAssignedUsers: ["Jun", "Mei", "Sora"],
    externalDueDate: iso(-2 * 86_400_000),
  }),
  createJob({
    id: "job_review_soon",
    kind: "review",
    type: null,
    status: "waiting_for_review",
    externalTitle: "Review release notes 4.2",
    externalTaskId: "CR-1207",
    externalTargetLocales: ["nl-NL"],
    externalAssignedUsers: ["Daan"],
    externalDueDate: iso(3 * 3_600_000),
  }),
  createJob({
    id: "job_failed_agent",
    status: "failed",
    assigneeType: "agent",
    externalTitle: "Translate help center articles",
    externalTaskId: "CR-1190",
    externalTargetLocales: ["th-TH", "vi-VN"],
    externalAssignedUsers: null,
    lastError: "provider rate limit exceeded while uploading translations",
    externalDueDate: iso(86_400_000),
  }),
  ...Array.from({ length: 3 }, (_, index) =>
    createJob({
      id: `job_done_${index}`,
      status: "succeeded",
      externalTitle: `Translate blog post #${index + 41}`,
      externalTaskId: `CR-11${70 + index}`,
      externalTargetLocales: ["fr-FR"],
      externalAssignedUsers: ["Mina"],
      externalDueDate: iso(-(index + 1) * 86_400_000),
      completedAt: iso(-(index + 1) * 3_600_000),
    }),
  ),
  createJob({
    id: "job_cancelled",
    status: "cancelled",
    externalTitle: "Translate deprecated FAQ",
    externalTaskId: "CR-1150",
  }),
];

export const ProjectJobsKanban: Story = {
  args: {
    organizationSlug: "acme",
    projectId: "project_website",
    isProviderProjectScope: true,
    nativeJobs: [],
    tmsJobs: boardJobs,
    hasActiveTmsConnection: true,
    isNativeLoading: false,
    isTmsLoading: false,
    now: fixedNow,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Board" }));
    await expect(canvas.getByRole("region", { name: "Queued, 2 jobs" })).toBeInTheDocument();
    await expect(canvas.getByRole("region", { name: "Failed, 1 job" })).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Expand Cancelled column" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Filter" })).toBeNull();
  },
};

export const Loading: Story = {
  args: {
    organizationSlug: "acme",
    nativeJobs: [],
    tmsJobs: [],
    hasActiveTmsConnection: true,
    isNativeLoading: true,
    isTmsLoading: true,
    now: fixedNow,
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Jobs" })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const Empty: Story = {
  args: {
    organizationSlug: "acme",
    nativeJobs: [],
    tmsJobs: [],
    hasActiveTmsConnection: true,
    isNativeLoading: false,
    isTmsLoading: false,
    now: fixedNow,
  },
};

export const GeneralError: Story = {
  args: {
    organizationSlug: "acme",
    nativeJobs,
    tmsJobs,
    hasActiveTmsConnection: true,
    isNativeLoading: false,
    isTmsLoading: false,
    nativeError: new Error("The jobs API returned a 500."),
    now: fixedNow,
  },
};

export const TmsConnectionRequired: Story = {
  args: {
    organizationSlug: "acme",
    nativeJobs: [],
    tmsJobs: [],
    hasActiveTmsConnection: true,
    isNativeLoading: false,
    isTmsLoading: false,
    tmsError: new Error("Crowdin needs a user connection."),
    renderError: ({ error }) => (
      <div>
        <p className="text-sm font-medium text-flame-100">Connect Crowdin to view provider jobs.</p>
        {error instanceof Error ? (
          <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
        ) : null}
      </div>
    ),
    now: fixedNow,
  },
};
