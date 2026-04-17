import { Inngest } from "inngest";

import { env } from "@/lib/env";

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

export const inngest = new Inngest({
  id: "hyperlocalise-web",
  eventKey: env.INNGEST_EVENT_KEY,
  isDev: env.NODE_ENV !== "production",
});

export function createInngestTranslationJobQueue(client: Inngest = inngest): TranslationJobQueue {
  return {
    enqueue(event) {
      return client.send({
        id: getTranslationJobQueuedEventId(event.jobId),
        name: TRANSLATION_JOB_QUEUED_EVENT,
        data: event,
      });
    },
  };
}

export function createInngestGitHubReviewQueue(client: Inngest = inngest): GitHubReviewQueue {
  return {
    enqueue(event, eventId) {
      return client.send({
        id:
          eventId ??
          getGitHubReviewRequestedEventId(
            event.reviewKey,
            event.trigger.type,
            event.trigger.deliveryId,
          ),
        name: GITHUB_REVIEW_REQUESTED_EVENT,
        data: event,
      });
    },
  };
}
