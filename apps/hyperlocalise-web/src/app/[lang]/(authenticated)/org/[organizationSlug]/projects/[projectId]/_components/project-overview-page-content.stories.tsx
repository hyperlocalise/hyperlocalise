import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  projectOverviewCaughtUpFixture,
  projectOverviewFilesFixture,
  projectOverviewFixture,
  projectOverviewJobsFixture,
  projectOverviewSyncErrorFixture,
} from "./project-overview.fixture";
import { ProjectOverviewPageContentView } from "./project-overview-page-content";

const meta = {
  title: "App/Project/Overview/Page",
  component: ProjectOverviewPageContentView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    projectId: "project_website",
    project: projectOverviewFixture,
    isProjectLoading: false,
    isProjectError: false,
    jobs: projectOverviewJobsFixture,
    isJobsLoading: false,
    isJobsError: false,
    files: projectOverviewFilesFixture,
    isFilesLoading: false,
    isFilesError: false,
  },
} satisfies Meta<typeof ProjectOverviewPageContentView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Website localization" })).toBeInTheDocument();
    await expect(canvas.getByText("A few things need your attention")).toBeInTheDocument();
    await expect(canvas.getByText("Ongoing")).toBeInTheDocument();
    await expect(canvas.getByText("home.json")).toBeInTheDocument();
  },
};

export const CaughtUp: Story = {
  args: {
    project: projectOverviewCaughtUpFixture,
    jobs: [],
    files: [projectOverviewFilesFixture[1]!],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("You're all caught up")).toBeInTheDocument();
    await expect(canvas.getByText("Browse files")).toBeInTheDocument();
  },
};

export const SyncError: Story = {
  args: {
    project: projectOverviewSyncErrorFixture,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Sync needs attention")).toBeInTheDocument();
    await expect(
      canvas.getByText("Provider credentials expired during the last sync."),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    project: null,
    isProjectLoading: true,
    isJobsLoading: true,
    isFilesLoading: true,
    jobs: [],
    files: [],
  },
};

export const EmptyOngoing: Story = {
  args: {
    project: projectOverviewCaughtUpFixture,
    jobs: [],
    files: [projectOverviewFilesFixture[1]!],
  },
};
