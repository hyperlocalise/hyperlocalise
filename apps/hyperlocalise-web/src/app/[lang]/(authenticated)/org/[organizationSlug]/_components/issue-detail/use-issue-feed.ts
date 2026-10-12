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

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

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
  const { client: goSvcClient } = useGoSvcClient();

  return useInfiniteQuery({
    queryKey: issueFeedQueryKey(organizationSlug, projectId, issueId),
    enabled: Boolean(organizationSlug && projectId && issueId && enabled),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      try {
        return (await goSvcClient.issueSheet.feed(organizationSlug, projectId, issueId, {
          limit: ISSUE_FEED_PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
        })) as IssueFeedPage;
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load issue feed"), { cause: error });
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
