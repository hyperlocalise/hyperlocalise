import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import { ProviderJobDescriptionFieldView } from "../../../../../jobs/_components/provider-job-description-field";
import { createLiveCrowdinJobComments, createLiveCrowdinJobDetail } from "./job-detail.fixture";
import { JobSourceFilesPanel } from "./tms/job-source-files-panel";
import { ProviderLiveJobDetailView } from "./provider-live-job-detail-view";

const meta = {
  title: "App/Project/Jobs/Detail/Live Provider",
  component: ProviderLiveJobDetailView,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ProviderLiveJobDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

const liveJob = createLiveCrowdinJobDetail();
const sourceFiles: ProjectFileRecord[] = [
  {
    origin: "provider",
    sourcePath: "marketing/home.json",
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: "2026-06-06T11:50:00.000Z",
    storedFileId: null,
    metadata: {},
    filename: "home.json",
    byteSize: null,
    provider: {
      kind: "crowdin",
      resourceType: "file",
      externalProjectId: "project_website",
      externalResourceId: "file_home_json",
      externalUrl: "https://crowdin.example/project/files/home.json",
      syncState: "synced",
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
      localeReadiness: {
        "fr-FR": { translationProgress: 68, approvalProgress: 24 },
        "de-DE": { translationProgress: 52, approvalProgress: 10 },
      },
      revision: "18",
      format: "json",
      lastSyncedAt: "2026-06-06T11:50:00.000Z",
    },
    latestJob: null,
  },
  {
    origin: "provider",
    sourcePath: "marketing/pricing.json",
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: "2026-06-06T11:50:00.000Z",
    storedFileId: null,
    metadata: {},
    filename: "pricing.json",
    byteSize: null,
    provider: {
      kind: "crowdin",
      resourceType: "file",
      externalProjectId: "project_website",
      externalResourceId: "file_pricing_json",
      externalUrl: "https://crowdin.example/project/files/pricing.json",
      syncState: "synced",
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
      localeReadiness: {
        "fr-FR": { translationProgress: 81, approvalProgress: 44 },
        "de-DE": { translationProgress: 63, approvalProgress: 28 },
      },
      revision: "7",
      format: "json",
      lastSyncedAt: "2026-06-06T11:50:00.000Z",
    },
    latestJob: null,
  },
];

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
    renderFilesSection: ({ jobId, organizationSlug, projectId }) => (
      <JobSourceFilesPanel
        organizationSlug={organizationSlug}
        projectId={projectId}
        encodedJobId={jobId}
        files={sourceFiles}
        highlightLocale="fr-FR"
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translate marketing homepage")).toBeInTheDocument();
    await expect(canvas.getByText("68%")).toBeInTheDocument();
    await expect(canvas.getByText("home.json")).toBeInTheDocument();
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
