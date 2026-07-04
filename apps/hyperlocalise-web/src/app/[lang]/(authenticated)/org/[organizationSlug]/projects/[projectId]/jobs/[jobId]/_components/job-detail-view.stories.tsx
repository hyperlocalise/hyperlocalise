import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Link from "next/link";
import { expect, userEvent } from "storybook/test";
import { LinkSquare02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { buildJobCatHref } from "@/lib/projects/job-cat-routing";

import { ProviderJobDescriptionFieldView } from "../../../../../jobs/_components/provider-job-description-field";
import {
  createAgentRunRecords,
  createLiveCrowdinJobComments,
  createLiveCrowdinJobDetail,
  createNativeJobDetail,
  createProviderBackedJobDetail,
  toProviderBackedJobFields,
} from "./job-detail.fixture";
import {
  jobDetailTaskLayoutFromLiveJob,
  jobDetailTaskLayoutFromRecord,
} from "./job-detail-layout-helpers";
import { JobDetailTaskView } from "./job-detail-task-view";
import type { JobDetailRecord } from "./job-detail-types";
import { JobProviderDetailSectionView } from "./job-provider-detail-section-view";
import { NativeJobSourceFilesSection } from "./native-job-detail-helpers";
import { JobSourceFilesPanel } from "./tms/job-source-files-panel";

const meta = {
  title: "App/Project/Jobs/Detail",
  component: JobDetailTaskView,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof JobDetailTaskView>;

export default meta;
type Story = StoryObj<typeof meta>;

const organizationSlug = "acme";
const projectId = "project_website";

const nativeJob = createNativeJobDetail();
const failedJob = createNativeJobDetail({
  status: "failed",
  lastError: "Translation provider timed out after 120 seconds.",
});
const syncedJob = createProviderBackedJobDetail();
const syncedJobFields = toProviderBackedJobFields(syncedJob);
const liveJob = createLiveCrowdinJobDetail();
const liveJobCatHref = buildJobCatHref(organizationSlug, projectId, liveJob);

const liveSourceFiles: ProjectFileRecord[] = [
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
];

function syncedProviderMain({
  agentRuns,
  agentRunsLoading = false,
}: {
  agentRuns?: ReturnType<typeof createAgentRunRecords>;
  agentRunsLoading?: boolean;
}) {
  return (
    <JobProviderDetailSectionView
      job={syncedJobFields}
      jobId={syncedJob.id}
      organizationSlug={organizationSlug}
      projectId={projectId}
      agentRuns={agentRuns}
      agentRunsLoading={agentRunsLoading}
      onStartAgentRun={() => undefined}
      showProviderMetadata={false}
      showAgentActions={false}
    />
  );
}

function taskViewArgsFromRecord(job: JobDetailRecord) {
  const layout = jobDetailTaskLayoutFromRecord(job);
  return {
    jobId: job.id,
    organizationSlug,
    projectId,
    isLoading: false,
    title: layout.title,
    metrics: layout.metrics,
    properties: layout.properties,
    secondaryProperties: layout.secondaryProperties,
  };
}

function taskViewArgsFromLiveJob(job: typeof liveJob) {
  const layout = jobDetailTaskLayoutFromLiveJob(job);
  return {
    jobId: job.id,
    organizationSlug,
    projectId,
    isLoading: false,
    title: layout.title,
    metrics: layout.metrics,
    properties: layout.properties,
    secondaryProperties: layout.secondaryProperties,
  };
}

function liveCrowdinHeaderActions() {
  return (
    <>
      <Button
        nativeButton={false}
        render={
          <a href={liveJob.externalUrl!} target="_blank" rel="noreferrer noopener">
            <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.8} />
            Open in crowdin
          </a>
        }
        size="sm"
        variant="outline"
      />
      <Button size="sm" variant="outline">
        <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
        Refresh
      </Button>
      {liveJobCatHref ? (
        <Button size="sm" render={<Link href={liveJobCatHref} />}>
          <ListIcon />
          View strings
        </Button>
      ) : null}
    </>
  );
}

function liveFilesSection({
  jobId,
  organizationSlug: orgSlug,
  projectId: projId,
}: {
  jobId: string;
  organizationSlug: string;
  projectId: string;
}) {
  return (
    <JobSourceFilesPanel
      organizationSlug={orgSlug}
      projectId={projId}
      encodedJobId={jobId}
      files={liveSourceFiles}
      highlightLocale="fr-FR"
    />
  );
}

function liveCommentsSection() {
  const comments = createLiveCrowdinJobComments();

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {comments.map((comment) => (
        <li key={comment.id} className="px-3 py-3">
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
            {comment.text}
          </p>
        </li>
      ))}
    </ul>
  );
}

export const RunningFileTranslation: Story = {
  args: {
    ...taskViewArgsFromRecord(nativeJob),
    renderFilesSection: () => (
      <NativeJobSourceFilesSection
        organizationSlug={organizationSlug}
        projectId={projectId}
        job={nativeJob}
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Properties")).toBeInTheDocument();
    await expect(canvas.getByText("Task type")).toBeInTheDocument();
    await expect(canvas.getByText("Running")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Files" }));
    await expect(canvas.getByText("home.json")).toBeInTheDocument();
  },
};

export const FailedJob: Story = {
  args: {
    ...taskViewArgsFromRecord(failedJob),
    renderFilesSection: () => (
      <NativeJobSourceFilesSection
        organizationSlug={organizationSlug}
        projectId={projectId}
        job={failedJob}
      />
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Failed")).toBeInTheDocument();
  },
};

const waitingForReviewJob = createNativeJobDetail({
  status: "waiting_for_review",
  kind: "review",
  type: null,
});

export const WaitingForReview: Story = {
  args: taskViewArgsFromRecord(waitingForReviewJob),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Waiting for review")).toBeInTheDocument();
  },
};

export const SyncedCrowdinFallback: Story = {
  args: {
    ...taskViewArgsFromRecord(syncedJob),
    description: "Translate the launch campaign strings.",
    renderDescriptionField: ({ description }) => (
      <ProviderJobDescriptionFieldView
        description={description}
        editable={false}
        onSaveDescription={async (nextDescription) => nextDescription}
      />
    ),
    renderExtraMain: () => syncedProviderMain({ agentRuns: createAgentRunRecords() }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translate marketing homepage")).toBeInTheDocument();
    await expect(canvas.getByText("Properties")).toBeInTheDocument();
    await expect(canvas.queryByText("Provider Details")).not.toBeInTheDocument();
  },
};

export const EmptyAgentRuns: Story = {
  args: {
    ...taskViewArgsFromRecord(syncedJob),
    description: "Translate the launch campaign strings.",
    renderDescriptionField: ({ description }) => (
      <ProviderJobDescriptionFieldView
        description={description}
        editable={false}
        onSaveDescription={async (nextDescription) => nextDescription}
      />
    ),
    renderExtraMain: () => syncedProviderMain({ agentRuns: [] }),
  },
};

export const AgentRunsLoading: Story = {
  args: {
    ...taskViewArgsFromRecord(syncedJob),
    description: "Translate the launch campaign strings.",
    renderDescriptionField: ({ description }) => (
      <ProviderJobDescriptionFieldView
        description={description}
        editable={false}
        onSaveDescription={async (nextDescription) => nextDescription}
      />
    ),
    renderExtraMain: () => syncedProviderMain({ agentRunsLoading: true }),
  },
};

export const LiveCrowdinTask: Story = {
  args: {
    ...taskViewArgsFromLiveJob(liveJob),
    headerActions: liveCrowdinHeaderActions(),
    description:
      "Translate the launch campaign strings for the marketing homepage refresh. Preserve product names, ICU placeholders, and analytics event keys exactly as written.",
    canEditDescription: true,
    renderDescriptionField: ({ description, editable }) => (
      <ProviderJobDescriptionFieldView
        description={description}
        editable={editable}
        onSaveDescription={async (nextDescription) => nextDescription}
      />
    ),
    renderFilesSection: liveFilesSection,
    showComments: true,
    renderCommentsSection: liveCommentsSection,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translate marketing homepage")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "View strings" })).toBeInTheDocument();
    await expect(canvas.getByText("68%")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Files" }));
    await expect(canvas.getByText("home.json")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Comments" }));
    await expect(canvas.getByText(/Preserve product name casing/)).toBeInTheDocument();
  },
};

export const CommentsLoading: Story = {
  args: {
    ...taskViewArgsFromLiveJob(liveJob),
    renderFilesSection: liveFilesSection,
    showComments: true,
    renderCommentsSection: () => <p className="text-sm text-muted-foreground">Loading comments…</p>,
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Comments" }));
    await expect(canvas.getByText("Loading comments…")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    jobId: nativeJob.id,
    organizationSlug,
    projectId,
    isLoading: true,
    properties: [],
  },
};

export const LoadError: Story = {
  args: {
    jobId: nativeJob.id,
    organizationSlug,
    projectId,
    isLoading: false,
    error: "Failed to load job (404)",
    properties: [],
  },
};
