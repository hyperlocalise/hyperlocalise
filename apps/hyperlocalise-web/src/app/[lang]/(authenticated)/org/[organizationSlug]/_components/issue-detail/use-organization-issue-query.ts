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

export function organizationIssueQueryKey(organizationSlug: string, issueId: string) {
  return ["organization-issue", organizationSlug, issueId] as const;
}

export function useOrganizationIssueQuery({
  organizationSlug,
  issueId,
  enabled = true,
}: {
  organizationSlug: string;
  issueId: string | undefined;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: organizationIssueQueryKey(organizationSlug, issueId ?? ""),
    enabled: enabled && Boolean(issueId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["issue-sheet"][
        ":issueId"
      ].$get({
        param: { organizationSlug, issueId: issueId! },
      } as never);
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load issue");
      }
      const body = await response.json();
      return body.issue;
    },
  });
}
