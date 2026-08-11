"use client";

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
import { useQuery } from "@tanstack/react-query";

import { readApiResponseError } from "@/lib/api-error";

import { issueSheetApiPath } from "./issue-detail-utils";

export type IssueSubscriber = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

export function issueSubscribersQueryKey(
  organizationSlug: string,
  projectId: string,
  issueId: string,
) {
  return ["issue-subscribers", organizationSlug, projectId, issueId] as const;
}

export function useIssueSubscribersQuery({
  organizationSlug,
  projectId,
  issueId,
  enabled = true,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: issueSubscribersQueryKey(organizationSlug, projectId, issueId),
    enabled,
    queryFn: async () => {
      const response = await fetch(
        `${issueSheetApiPath(organizationSlug, projectId)}/${issueId}/subscriptions`,
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load issue subscribers");
      }
      const body = (await response.json()) as { subscribers: IssueSubscriber[] };
      return body.subscribers;
    },
  });
}
