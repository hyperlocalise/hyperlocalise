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
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { readApiResponseError } from "@/lib/api-error";

import { issueSheetApiPath } from "./issue-detail-utils";
import { issueFeedQueryKey } from "./use-issue-feed";

export type IssueCommentAuthor = {
  userId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
};

export type IssueComment = {
  id: string;
  issueId: string;
  projectId: string;
  organizationId: string;
  parentId: string | null;
  path: string;
  depth: number;
  body: string;
  author: IssueCommentAuthor | null;
  mentionedUserIds: string[];
  mentionedIssueIds: string[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

export type IssueCommentsPage = {
  issueComments: IssueComment[];
  total: number;
  nextCursor: string | null;
};

export const ISSUE_COMMENTS_PAGE_SIZE = 100;

export function issueCommentsQueryKey(
  organizationSlug: string,
  projectId: string,
  issueId: string,
) {
  return ["issue-comments", organizationSlug, projectId, issueId] as const;
}

function commentsApiPath(organizationSlug: string, projectId: string, issueId: string) {
  return `${issueSheetApiPath(organizationSlug, projectId)}/${encodeURIComponent(issueId)}/comments`;
}

export function useIssueCommentsQuery({
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
    queryKey: issueCommentsQueryKey(organizationSlug, projectId, issueId),
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        sort: "thread",
        limit: String(ISSUE_COMMENTS_PAGE_SIZE),
      });
      if (pageParam) {
        params.set("cursor", pageParam);
      }
      const response = await fetch(
        `${commentsApiPath(organizationSlug, projectId, issueId)}?${params.toString()}`,
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load comments");
      }
      return (await response.json()) as IssueCommentsPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useIssueCommentMutations({
  organizationSlug,
  projectId,
  issueId,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
}) {
  const queryClient = useQueryClient();
  const commentsQueryKey = issueCommentsQueryKey(organizationSlug, projectId, issueId);
  const feedQueryKey = issueFeedQueryKey(organizationSlug, projectId, issueId);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: commentsQueryKey }),
      queryClient.invalidateQueries({ queryKey: feedQueryKey }),
    ]);

  const createComment = useMutation({
    mutationFn: async (input: {
      body: string;
      parentId?: string;
      mentionedUserIds?: string[];
      mentionedIssueIds?: string[];
    }) => {
      const response = await fetch(commentsApiPath(organizationSlug, projectId, issueId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to create comment");
      }
      return (await response.json()) as { issueComment: IssueComment };
    },
    onSuccess: invalidate,
  });

  const updateComment = useMutation({
    mutationFn: async (input: {
      commentId: string;
      body: string;
      mentionedUserIds?: string[];
      mentionedIssueIds?: string[];
    }) => {
      const response = await fetch(
        `${commentsApiPath(organizationSlug, projectId, issueId)}/${encodeURIComponent(input.commentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: input.body,
            mentionedUserIds: input.mentionedUserIds,
            mentionedIssueIds: input.mentionedIssueIds,
          }),
        },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to update comment");
      }
      return (await response.json()) as { issueComment: IssueComment };
    },
    onSuccess: invalidate,
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const response = await fetch(
        `${commentsApiPath(organizationSlug, projectId, issueId)}/${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to delete comment");
      }
    },
    onSuccess: invalidate,
  });

  return { createComment, updateComment, deleteComment };
}
