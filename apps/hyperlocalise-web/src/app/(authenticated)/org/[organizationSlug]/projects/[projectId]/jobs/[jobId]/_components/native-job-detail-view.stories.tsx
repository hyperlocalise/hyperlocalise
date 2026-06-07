import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  createNativeJobDetail,
  createProviderBackedJobDetail,
  toProviderBackedJobFields,
} from "./job-detail.fixture";
import { JobProviderDetailSectionView } from "./job-provider-detail-section-view";
import { NativeJobDetailView } from "./native-job-detail-view";

const meta = {
  title: "App/Project/Jobs/Detail/Native",
  component: NativeJobDetailView,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof NativeJobDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RunningTranslationJob: Story = {
  args: {
    jobId: "job_translate_homepage",
    organizationSlug: "acme",
    projectId: "project_website",
    job: createNativeJobDetail(),
    isLoading: false,
    onRetry: () => undefined,
    onMarkFailed: () => undefined,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "job_translate_homepage" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Overview")).toBeInTheDocument();
  },
};

export const FailedJob: Story = {
  args: {
    jobId: "job_translate_homepage",
    organizationSlug: "acme",
    projectId: "project_website",
    job: createNativeJobDetail({
      status: "failed",
      lastError: "Translation provider timed out after 120 seconds.",
    }),
    isLoading: false,
    onRetry: () => undefined,
    onMarkFailed: () => undefined,
  },
};

export const ProviderBackedJob: Story = {
  args: {
    jobId: "job_crowdin_1204",
    organizationSlug: "acme",
    projectId: "project_website",
    job: createProviderBackedJobDetail(),
    isLoading: false,
    renderProviderDetailSection: ({ job, jobId, organizationSlug, projectId }) => (
      <JobProviderDetailSectionView
        job={toProviderBackedJobFields(job)}
        jobId={jobId}
        organizationSlug={organizationSlug}
        projectId={projectId}
        agentRuns={[]}
        agentRunsLoading={false}
        onStartAgentRun={() => undefined}
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translate marketing homepage")).toBeInTheDocument();
    await expect(canvas.getByText("Provider Details")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    jobId: "job_translate_homepage",
    organizationSlug: "acme",
    projectId: "project_website",
    isLoading: true,
  },
};

export const LoadError: Story = {
  args: {
    jobId: "job_translate_homepage",
    organizationSlug: "acme",
    projectId: "project_website",
    isLoading: false,
    error: "Failed to load job (404)",
  },
};
