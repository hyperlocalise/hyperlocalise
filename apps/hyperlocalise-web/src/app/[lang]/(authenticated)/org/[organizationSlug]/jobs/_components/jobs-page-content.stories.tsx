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
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Jobs" })).toBeInTheDocument();
    await expect(canvas.getByText("Translate marketing homepage")).toBeInTheDocument();
    await expect(canvas.getByText("Running")).toBeInTheDocument();
    await expect(canvas.getByText("Waiting for review")).toBeInTheDocument();
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
    nativeJobs: [],
    tmsJobs: tmsJobs.slice(0, 2),
    hasActiveTmsConnection: true,
    isNativeLoading: false,
    isTmsLoading: false,
    now: fixedNow,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Row" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Board" })).toBeInTheDocument();
    await expect(canvas.getAllByRole("link", { name: "View strings" }).length).toBeGreaterThan(0);
    await expect(canvas.getAllByRole("link", { name: "Details" }).length).toBeGreaterThan(0);
  },
};

export const ProjectJobsKanban: Story = {
  args: {
    organizationSlug: "acme",
    projectId: "project_website",
    nativeJobs: [],
    tmsJobs,
    hasActiveTmsConnection: true,
    isNativeLoading: false,
    isTmsLoading: false,
    now: fixedNow,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Board" }));
    await expect(canvas.getByText("Queued")).toBeInTheDocument();
    await expect(canvas.getByText("Running")).toBeInTheDocument();
    await expect(canvas.getByText("Waiting for review")).toBeInTheDocument();
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
          <p className="mt-1 text-xs text-foreground/42">{error.message}</p>
        ) : null}
      </div>
    ),
    now: fixedNow,
  },
};
