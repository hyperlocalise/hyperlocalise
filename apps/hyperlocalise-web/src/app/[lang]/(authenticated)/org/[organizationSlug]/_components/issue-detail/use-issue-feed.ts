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

import { readApiResponseError } from "@/lib/api-error";

import { issueSheetApiPath } from "./issue-detail-utils";
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
      const params = new URLSearchParams({
        limit: String(ISSUE_FEED_PAGE_SIZE),
      });
      if (pageParam) {
        params.set("cursor", pageParam);
      }
      const response = await fetch(
        `${issueSheetApiPath(organizationSlug, projectId)}/${encodeURIComponent(issueId)}/feed?${params.toString()}`,
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load issue feed");
      }
      return (await response.json()) as IssueFeedPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
