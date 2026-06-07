import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  createAgentRunRecords,
  createProviderBackedJobDetail,
  toProviderBackedJobFields,
} from "./job-detail.fixture";
import { JobProviderDetailSectionView } from "./job-provider-detail-section-view";

const meta = {
  title: "App/Jobs/Detail/Provider Section",
  component: JobProviderDetailSectionView,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof JobProviderDetailSectionView>;

export default meta;
type Story = StoryObj<typeof meta>;

const providerJob = toProviderBackedJobFields(createProviderBackedJobDetail());

export const SyncedCrowdinJob: Story = {
  args: {
    job: providerJob,
    jobId: "job_crowdin_1204",
    organizationSlug: "acme",
    projectId: "project_website",
    agentRuns: createAgentRunRecords(),
    agentRunsLoading: false,
    onStartAgentRun: () => undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Provider Details")).toBeInTheDocument();
    await expect(canvas.getByText("Translate marketing homepage")).toBeInTheDocument();
    await expect(canvas.getByText("Translate with agent")).toBeInTheDocument();
  },
};

export const LoadingAgentRuns: Story = {
  args: {
    job: providerJob,
    jobId: "job_crowdin_1204",
    organizationSlug: "acme",
    projectId: "project_website",
    agentRunsLoading: true,
  },
};

export const EmptyAgentRuns: Story = {
  args: {
    job: providerJob,
    jobId: "job_crowdin_1204",
    organizationSlug: "acme",
    projectId: "project_website",
    agentRuns: [],
    agentRunsLoading: false,
  },
};
