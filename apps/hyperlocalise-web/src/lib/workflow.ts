import { start } from "workflow/api";

import { translationJobWorkflow } from "@/workflows/translation-job";

export const TRANSLATION_JOB_QUEUED_EVENT = "translation/job.queued";
export const GITHUB_REVIEW_REQUESTED_EVENT = "github/review.requested";
export const HYPERLOCALISE_REVIEW_CHECK_NAME = "Hyperlocalise Review";

export type TranslationJobQueuedEventData = {
  jobId: string;
  projectId: string;
  type: "string" | "file";
};

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

export type TranslationJobQueue = {
  enqueue(event: TranslationJobQueuedEventData): Promise<{ ids: string[] }>;
};

export type GitHubReviewQueue = {
  enqueue(event: GitHubReviewRequestedEventData, eventId?: string): Promise<{ ids: string[] }>;
};

export function getTranslationJobQueuedEventId(jobId: string) {
  return `translation-job-queued:${jobId}`;
}

export function getGitHubReviewKey(input: {
  repositoryOwner: string;
  repositoryName: string;
  pullRequestNumber: number;
  headSha: string;
}) {
  return `github-review:${input.repositoryOwner}/${input.repositoryName}:pr:${input.pullRequestNumber}:sha:${input.headSha}`.toLowerCase();
}

export function getGitHubReviewRequestedEventId(
  reviewKey: string,
  triggerType: GitHubReviewTriggerType,
  deliveryId?: string | null,
) {
  const normalizedDeliveryId = deliveryId?.trim();
  if (normalizedDeliveryId) {
    return `github-review-requested:${normalizedDeliveryId}`;
  }

  return `github-review-requested:${triggerType}:${reviewKey}`;
}

export function createWorkflowTranslationJobQueue(): TranslationJobQueue {
  return {
    async enqueue(event) {
      const run = await start(translationJobWorkflow, [event]);

      return {
        ids: [run.runId],
      };
    },
  };
}

export function createWorkflowGitHubReviewQueue(): GitHubReviewQueue {
  return {
    async enqueue(event, eventId) {
      return {
        ids: [
          eventId ??
            getGitHubReviewRequestedEventId(
              event.reviewKey,
              event.trigger.type,
              event.trigger.deliveryId,
            ),
        ],
      };
    },
  };
}
