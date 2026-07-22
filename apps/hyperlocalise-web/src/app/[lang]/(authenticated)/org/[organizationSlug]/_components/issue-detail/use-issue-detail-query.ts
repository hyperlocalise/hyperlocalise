"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useQuery } from "@tanstack/react-query";

import { readApiResponseError } from "@/lib/api-error";

import { issueSheetApiPath, type IssueDetailIssue } from "./issue-detail-utils";

export function issueDetailQueryKey(organizationSlug: string, projectId: string, issueId: string) {
  return ["issue-detail", organizationSlug, projectId, issueId] as const;
}

export function useIssueDetailQuery({
  organizationSlug,
  projectId,
  issueId,
  enabled = true,
}: {
  organizationSlug: string;
  projectId: string | undefined;
  issueId: string | undefined;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: issueDetailQueryKey(organizationSlug, projectId ?? "", issueId ?? ""),
    enabled: enabled && Boolean(projectId && issueId),
    queryFn: async () => {
      const response = await fetch(`${issueSheetApiPath(organizationSlug, projectId!)}/${issueId}`);
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load issue");
      }
      const body = (await response.json()) as { issue: IssueDetailIssue };
      return body.issue;
    },
  });
}
