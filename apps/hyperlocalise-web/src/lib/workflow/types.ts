import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";

export type JobEventData<Kind extends string, Type extends string = string> = {
  kind: Kind;
  jobId: string;
  projectId: string;
  type: Type;
};

export type TranslationJobEventData = JobEventData<"translation", "string" | "file">;

export type GitHubReviewTriggerType = "pull_request" | "mention";

export type GitHubFixScope =
  | {
      type: "pull_request";
    }
  | {
      type: "review_comment";
      path: string;
      line: number | null;
      originalLine: number | null;
      side: "LEFT" | "RIGHT" | null;
      commitSha: string | null;
      locale: string | null;
    };

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

export type GitHubFixRequestedEventData = {
  installationId: number;
  repositoryOwner: string;
  repositoryName: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  trigger: {
    event: "issue_comment" | "pull_request_review_comment";
    action: string;
    deliveryId: string | null;
    commentId: number | null;
    requesterLogin: string;
  };
  scope: GitHubFixScope;
};

export type JobQueue<Event> = {
  enqueue(event: Event): Promise<{ ids: string[] }>;
};

export type GitHubFixQueue = JobQueue<GitHubFixRequestedEventData>;

export type I18nSetupQueue = JobQueue<
  import("@/lib/agents/i18n-setup/i18n-setup-task").I18nSetupRequestedEventData
>;

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

export type ProviderWebhookReconciliationEventData = {
  providerWebhookEventId: string;
  providerSyncIntentId: string;
  organizationId: string;
  subscriptionId: string;
  providerKind: ExternalTmsProviderKind;
};

export type ProviderWebhookReconciliationQueue = JobQueue<ProviderWebhookReconciliationEventData>;
