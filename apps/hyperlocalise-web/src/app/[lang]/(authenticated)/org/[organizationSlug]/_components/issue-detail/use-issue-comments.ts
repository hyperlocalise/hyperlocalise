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

import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";

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
  const feedQueryKey = issueFeedQueryKey(organizationSlug, projectId, issueId);
  const comments =
    apiClient.api.orgs[":organizationSlug"].projects[":projectId"]["issue-sheet"][":issueId"]
      .comments;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: feedQueryKey });

  const createComment = useMutation({
    mutationFn: async (input: {
      body: string;
      parentId?: string;
      mentionedUserIds?: string[];
      mentionedIssueIds?: string[];
    }) => {
      const response = await comments.$post({
        param: { organizationSlug, projectId, issueId },
        json: input,
      } as never);
      if (response.status !== 201) {
        throw await readApiResponseError(response, "Failed to create comment");
      }
      return response.json();
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
      const response = await comments[":commentId"].$patch({
        param: { organizationSlug, projectId, issueId, commentId: input.commentId },
        json: {
          body: input.body,
          mentionedUserIds: input.mentionedUserIds,
          mentionedIssueIds: input.mentionedIssueIds,
        },
      } as never);
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to update comment");
      }
      return response.json();
    },
    onSuccess: invalidate,
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const response = await comments[":commentId"].$delete({
        param: { organizationSlug, projectId, issueId, commentId },
      } as never);
      if (response.status !== 204) {
        throw await readApiResponseError(response, "Failed to delete comment");
      }
    },
    onSuccess: invalidate,
  });

  return { createComment, updateComment, deleteComment };
}
