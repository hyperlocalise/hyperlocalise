import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { automationsFixture } from "../../automations/_components/automations.fixture";
import {
  dashboardAutomationRunsFixture,
  dashboardIntegrationsCompleteFixture,
  dashboardIntegrationsIncompleteFixture,
  dashboardJobsFixture,
  dashboardProjectsItemsFixture,
} from "./dashboard.fixture";
import { DashboardPageView } from "./dashboard-page-view";
import {
  resolveAutomationSnapshotStats,
  resolveDashboardHero,
  resolveWorkspacePendingActionCount,
} from "./dashboard-page-view-model";

const organizationSlug = "acme";

const activeHero = resolveDashboardHero({
  integrations: dashboardIntegrationsCompleteFixture,
  projectCount: dashboardProjectsItemsFixture.length,
  pendingCount: resolveWorkspacePendingActionCount({
    projects: dashboardProjectsItemsFixture.map((project) => ({
      openJobCount: project.pendingActionCount,
    })),
    jobs: dashboardJobsFixture,
  }),
  integrationsHref: `/org/${organizationSlug}/integrations`,
  myJobsHref: `/org/${organizationSlug}/my-jobs`,
  newRequestHref: `/org/${organizationSlug}/chat`,
});

const setupHero = resolveDashboardHero({
  integrations: dashboardIntegrationsIncompleteFixture,
  projectCount: 0,
  pendingCount: 0,
  integrationsHref: `/org/${organizationSlug}/integrations`,
  myJobsHref: `/org/${organizationSlug}/my-jobs`,
  newRequestHref: `/org/${organizationSlug}/chat`,
});

const caughtUpHero = resolveDashboardHero({
  integrations: dashboardIntegrationsCompleteFixture,
  projectCount: dashboardProjectsItemsFixture.length,
  pendingCount: 0,
  integrationsHref: `/org/${organizationSlug}/integrations`,
  myJobsHref: `/org/${organizationSlug}/my-jobs`,
  newRequestHref: `/org/${organizationSlug}/chat`,
});

const meta = {
  title: "App/Dashboard/Page",
  component: DashboardPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug,
    hero: activeHero,
    integrations: dashboardIntegrationsCompleteFixture,
    jobs: dashboardJobsFixture,
    projects: dashboardProjectsItemsFixture,
    automationStats: resolveAutomationSnapshotStats(automationsFixture),
    automationRuns: dashboardAutomationRunsFixture,
    automationsEnabled: true,
    isIntegrationsLoading: false,
    isJobsLoading: false,
    isJobsError: false,
    isProjectsLoading: false,
    isProjectsError: false,
    isAutomationsLoading: false,
    isAutomationsError: false,
  },
} satisfies Meta<typeof DashboardPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await expect(canvas.getByText("My jobs")).toBeInTheDocument();
    await expect(canvas.getByText("Recent projects")).toBeInTheDocument();
    await expect(canvas.getByText("Integrations")).toBeInTheDocument();
    await expect(canvas.getByText("Automation runs")).toBeInTheDocument();
    await expect(canvas.getByText("Review: terminology consistency")).toBeInTheDocument();
    await expect(canvas.getByText("Website localization")).toBeInTheDocument();
  },
};

export const SetupIncomplete: Story = {
  args: {
    hero: setupHero,
    integrations: dashboardIntegrationsIncompleteFixture,
    jobs: [],
    projects: [],
    automationRuns: [],
    automationStats: { total: 0, active: 0, paused: 0 },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Get your workspace ready")).toBeInTheDocument();
    await expect(canvas.getByText("Finish setup")).toBeInTheDocument();
    await expect(canvas.getByText("No jobs assigned to you yet.")).toBeInTheDocument();
  },
};

export const CaughtUp: Story = {
  args: {
    hero: caughtUpHero,
    jobs: dashboardJobsFixture.filter((job) => job.status === "succeeded").slice(0, 3),
    projects: dashboardProjectsItemsFixture.map((project) => ({
      ...project,
      pendingActionCount: 0,
    })),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("You're all caught up")).toBeInTheDocument();
    await expect(canvas.getAllByText("Up to date").length).toBeGreaterThan(0);
  },
};

export const AutomationsDisabled: Story = {
  args: {
    automationsEnabled: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Automation runs")).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    jobs: [],
    projects: [],
    integrations: [],
    automationRuns: [],
    isIntegrationsLoading: true,
    isJobsLoading: true,
    isProjectsLoading: true,
    isAutomationsLoading: true,
  },
};

export const Empty: Story = {
  args: {
    hero: caughtUpHero,
    jobs: [],
    projects: [],
    automationRuns: [],
    automationStats: { total: 0, active: 0, paused: 0 },
  },
};

export const LoadError: Story = {
  args: {
    jobs: [],
    projects: [],
    isJobsError: true,
    isProjectsError: true,
    isAutomationsError: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("My jobs could not be loaded.")).toBeInTheDocument();
    await expect(canvas.getByText("Recent projects could not be loaded.")).toBeInTheDocument();
    await expect(canvas.getByText("Automation runs could not be loaded.")).toBeInTheDocument();
  },
};
