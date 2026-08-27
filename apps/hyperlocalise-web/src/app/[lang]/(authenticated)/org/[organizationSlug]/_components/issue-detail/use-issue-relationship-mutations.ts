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
import { ISSUE_RELATIONSHIPS_QUERY_PREFIX } from "./use-issue-relationships-query";

export type IssueRelationshipRequestKind = "related" | "blocks" | "blocked_by" | "duplicate_of";

export function useIssueRelationshipMutations({
  organizationSlug,
  projectId,
  issueId,
}: {
  organizationSlug: string;
  projectId: string;
  issueId: string;
}) {
  const queryClient = useQueryClient();
  const feedKey = issueFeedQueryKey(organizationSlug, projectId, issueId);
  const relationships =
    apiClient.api.orgs[":organizationSlug"].projects[":projectId"]["issue-sheet"][":issueId"]
      .relationships;

  const invalidate = () => {
    // A relationship is visible from both endpoint issues, but only this issue's
    // own id is known here — the other side may live in a different project
    // (relationships are cross-project) with its own query key. Invalidate the
    // whole org-scoped prefix instead of just this issue's key so a relationship
    // added/removed here doesn't leave the other issue's cached list stale for
    // up to the 30s staleTime if the user is (or soon navigates) there.
    void queryClient.invalidateQueries({
      queryKey: [ISSUE_RELATIONSHIPS_QUERY_PREFIX, organizationSlug],
    });
    void queryClient.invalidateQueries({ queryKey: feedKey });
  };

  const createRelationship = useMutation({
    mutationFn: async (input: { relatedIssueId: string; kind: IssueRelationshipRequestKind }) => {
      const response = await relationships.$post({
        param: { organizationSlug, projectId, issueId },
        json: input,
      } as never);
      if (response.status !== 201) {
        throw await readApiResponseError(response, "Failed to create relationship");
      }
    },
    onSuccess: invalidate,
  });

  const deleteRelationship = useMutation({
    mutationFn: async (relationshipId: string) => {
      const response = await relationships[":relationshipId"].$delete({
        param: { organizationSlug, projectId, issueId, relationshipId },
      } as never);
      if (response.status !== 204) {
        throw await readApiResponseError(response, "Failed to remove relationship");
      }
    },
    onSuccess: invalidate,
  });

  return {
    createRelationship,
    deleteRelationship,
    isPending: createRelationship.isPending || deleteRelationship.isPending,
  };
}
