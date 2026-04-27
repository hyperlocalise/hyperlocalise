import type { GitHubReviewTriggerType } from "./types";

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
