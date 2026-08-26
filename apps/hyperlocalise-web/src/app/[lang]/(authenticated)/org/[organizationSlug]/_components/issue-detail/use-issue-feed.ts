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
import { useInfiniteQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";

import type { IssueComment } from "./use-issue-comments";
import type { IssueActivity } from "./use-issue-activities";

export type IssueFeedItem =
  | { kind: "activity"; activity: IssueActivity }
  | {
      kind: "comment_thread";
      root: IssueComment;
      replies: IssueComment[];
    };

export type IssueFeedPage = {
  items: IssueFeedItem[];
  total: number;
  nextCursor: string | null;
};

export const ISSUE_FEED_PAGE_SIZE = 100;

export function issueFeedQueryKey(organizationSlug: string, projectId: string, issueId: string) {
  return ["issue-feed", organizationSlug, projectId, issueId] as const;
}

export function useIssueFeedQuery({
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
  return useInfiniteQuery({
    queryKey: issueFeedQueryKey(organizationSlug, projectId, issueId),
    enabled: Boolean(organizationSlug && projectId && issueId && enabled),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "issue-sheet"
      ][":issueId"].feed.$get({
        param: { organizationSlug, projectId, issueId },
        query: {
          limit: String(ISSUE_FEED_PAGE_SIZE),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      } as never);
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load issue feed");
      }
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
