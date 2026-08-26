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

import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";

export type IssueRelationshipPresentedKind =
  | "related"
  | "blocks"
  | "blocked_by"
  | "duplicate_of"
  | "duplicate";

export type IssueRelationship = {
  id: string;
  presentedKind: IssueRelationshipPresentedKind;
  otherIssue: { issueId: string; projectId: string; title: string; status: string };
  createdAt: string;
};

export const ISSUE_RELATIONSHIPS_QUERY_PREFIX = "issue-relationships";

export function issueRelationshipsQueryKey(
  organizationSlug: string,
  projectId: string,
  issueId: string,
) {
  return [ISSUE_RELATIONSHIPS_QUERY_PREFIX, organizationSlug, projectId, issueId] as const;
}

export function useIssueRelationshipsQuery({
  organizationSlug,
  projectId,
  issueId,
}: {
  organizationSlug: string;
  projectId: string | undefined;
  issueId: string | undefined;
}) {
  return useQuery({
    queryKey: issueRelationshipsQueryKey(organizationSlug, projectId ?? "", issueId ?? ""),
    enabled: Boolean(projectId && issueId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "issue-sheet"
      ][":issueId"].relationships.$get({
        param: { organizationSlug, projectId: projectId!, issueId: issueId! },
      } as never);
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load relationships");
      }
      const body = await response.json();
      return body.relationships;
    },
  });
}
