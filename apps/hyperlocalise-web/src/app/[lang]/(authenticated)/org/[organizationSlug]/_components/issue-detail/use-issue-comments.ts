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
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

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
  const { client: goSvcClient } = useGoSvcClient();
  const feedQueryKey = issueFeedQueryKey(organizationSlug, projectId, issueId);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: feedQueryKey });

  const createComment = useMutation({
    mutationFn: async (input: {
      body: string;
      parentId?: string;
      mentionedUserIds?: string[];
      mentionedIssueIds?: string[];
    }) => {
      try {
        return await goSvcClient.issueSheet.comments.create(
          organizationSlug,
          projectId,
          issueId,
          input,
        );
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to create comment"), { cause: error });
      }
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
      try {
        return await goSvcClient.issueSheet.comments.update(
          organizationSlug,
          projectId,
          issueId,
          input.commentId,
          {
            body: input.body,
            mentionedUserIds: input.mentionedUserIds,
            mentionedIssueIds: input.mentionedIssueIds,
          },
        );
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to update comment"), { cause: error });
      }
    },
    onSuccess: invalidate,
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      try {
        await goSvcClient.issueSheet.comments.delete(
          organizationSlug,
          projectId,
          issueId,
          commentId,
        );
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to delete comment"), { cause: error });
      }
    },
    onSuccess: invalidate,
  });

  return { createComment, updateComment, deleteComment };
}
