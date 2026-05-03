export type TranslationJobQueuedEventData = {
  jobId: string;
  projectId: string;
  type: "string" | "file";
};

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
  };
  scope: GitHubFixScope;
};

export type TranslationJobQueue = {
  enqueue(event: TranslationJobQueuedEventData): Promise<{ ids: string[] }>;
};

export type GitHubFixQueue = {
  enqueue(event: GitHubFixRequestedEventData): Promise<{ ids: string[] }>;
};

export type EmailAgentTaskAttachment = {
  id: string;
  filename: string;
  contentType: string;
  downloadUrl: string;
};

export type EmailAgentTask = {
  kind: "translate";
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

export type EmailAgentTaskQueue = {
  enqueue(task: EmailAgentTask): Promise<{ ids: string[] }>;
};
