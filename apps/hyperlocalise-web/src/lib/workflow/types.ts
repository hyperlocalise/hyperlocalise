export type JobEventData<Kind extends string, Type extends string = string> = {
  kind: Kind;
  jobId: string;
  projectId: string;
  type: Type;
};

export type TranslationJobEventData = JobEventData<"translation", "string" | "file">;

export type ReviewJobEventData = JobEventData<"review", "native">;

export type GitHubReviewTriggerType = "pull_request" | "mention";

export type GitHubReviewRequestedEventData = {
  checkRunName: string;
  reviewKey: string;
  installationId: number;
  repositoryOwner: string;
  repositoryName: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  headSha: string;
  baseSha: string | null;
  trigger: {
    type: GitHubReviewTriggerType;
    event: string;
    action: string;
    deliveryId: string | null;
    commentId: number | null;
  };
};

export type JobQueue<Event> = {
  enqueue(event: Event): Promise<{ ids: string[] }>;
};

export type EmailAgentTaskAttachment = {
  id: string;
  filename: string;
  contentType: string;
  downloadUrl: string;
};

export type EmailAgentTask = {
  kind: "translate";
  jobId: string;
  requestId: string;
  senderEmail: string;
  subject: string;
  originalMessageId: string;
  inboundEmailAddress: string;
  inputs: {
    attachments: [EmailAgentTaskAttachment];
  };
  parameters: {
    translate: {
      sourceLocale: string | null;
      targetLocale: string;
      instructions: string | null;
    };
  };
  replyPolicy: {
    type: "threaded_email";
  };
};

export type EmailAgentTaskQueue = JobQueue<EmailAgentTask>;

export type RepositoryAgentTaskQueue = JobQueue<
  import("@/lib/agents/repository-agent-task").RepositoryAgentTask
>;

export type ProviderAgentTranslationEventData = {
  agentRunId: string;
  organizationId: string;
};

export type ProviderAgentTranslationQueue = JobQueue<ProviderAgentTranslationEventData>;

export type ProviderAgentQaEventData = {
  agentRunId: string;
  organizationId: string;
};

export type ProviderAgentQaQueue = JobQueue<ProviderAgentQaEventData>;

export type ProviderAgentCommentEventData = {
  agentRunId: string;
  organizationId: string;
};

export type ProviderAgentCommentQueue = JobQueue<ProviderAgentCommentEventData>;

export type ProviderAgentWritebackEventData = {
  agentRunId: string;
  organizationId: string;
};

export type ProviderAgentWritebackQueue = JobQueue<ProviderAgentWritebackEventData>;

export type GithubRepositoryAutomationQueue = JobQueue<{
  jobId: string;
}>;

export type WorkspaceAutomationExecutionEventData = {
  workspaceAutomationRunId: string;
  organizationId: string;
};

export type WorkspaceAutomationExecutionQueue = JobQueue<WorkspaceAutomationExecutionEventData>;

export type ProviderSyncEventData = {
  providerSyncIntentId: string;
  organizationId: string;
};

export type ProviderSyncQueue = JobQueue<ProviderSyncEventData>;

export type SourceFileIngestEventData = {
  sourceFileVersionId: string;
  organizationId: string;
  projectId: string;
  storedFileId: string;
  sourcePath: string;
};

export type SourceFileIngestQueue = JobQueue<SourceFileIngestEventData>;

export type TranslationFileImportEventData = {
  organizationId: string;
  projectId: string;
  storedFileId: string;
  sourcePath: string;
  targetLocale: string;
  actorUserId?: string | null;
};

export type TranslationFileImportQueue = JobQueue<TranslationFileImportEventData>;
