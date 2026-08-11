/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { GitHubReviewTriggerType } from "./types";

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
