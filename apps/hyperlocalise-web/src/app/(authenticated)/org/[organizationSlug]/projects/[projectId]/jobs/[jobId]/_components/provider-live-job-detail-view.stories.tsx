import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { ProviderJobDescriptionFieldView } from "../../../../../jobs/_components/provider-job-description-field";
import { createLiveCrowdinJobComments, createLiveCrowdinJobDetail } from "./job-detail.fixture";
import { ProviderLiveJobDetailView } from "./provider-live-job-detail-view";

const meta = {
  title: "App/Jobs/Detail/Live Provider",
  component: ProviderLiveJobDetailView,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ProviderLiveJobDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

const liveJob = createLiveCrowdinJobDetail();

export const CrowdinTask: Story = {
  args: {
    jobId: liveJob.id,
    organizationSlug: "acme",
    projectId: "project_website",
    job: liveJob,
    isLoading: false,
    canEditProviderJobDescription: true,
    comments: createLiveCrowdinJobComments(),
    commentsLoading: false,
    onRefresh: () => undefined,
    renderDescriptionField: ({ description, editable }) => (
      <ProviderJobDescriptionFieldView
        description={description}
        editable={editable}
        onSaveDescription={async (nextDescription) => nextDescription}
      />
    ),
    renderFilesSection: () => (
      <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
        <p className="text-sm text-foreground/58">Source files panel (mock)</p>
      </section>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translate marketing homepage")).toBeInTheDocument();
    await expect(canvas.getByText("68%")).toBeInTheDocument();
    await expect(canvas.getByText(/Preserve product name casing/)).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    jobId: liveJob.id,
    organizationSlug: "acme",
    projectId: "project_website",
    isLoading: true,
  },
};

export const LoadError: Story = {
  args: {
    jobId: liveJob.id,
    organizationSlug: "acme",
    projectId: "project_website",
    isLoading: false,
    error: "Crowdin needs a user connection.",
  },
};

export const CommentsLoading: Story = {
  args: {
    jobId: liveJob.id,
    organizationSlug: "acme",
    projectId: "project_website",
    job: liveJob,
    isLoading: false,
    commentsLoading: true,
  },
};
