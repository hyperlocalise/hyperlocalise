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

export function issueSheetColumnsQueryKey(organizationSlug: string, projectId: string) {
  return ["issue-sheet-columns", organizationSlug, projectId] as const;
}

export function useIssueSheetColumnsQuery({
  organizationSlug,
  projectId,
  enabled = true,
}: {
  organizationSlug: string;
  projectId: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: issueSheetColumnsQueryKey(organizationSlug, projectId),
    enabled,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "issue-sheet"
      ].columns.$get({
        param: { organizationSlug, projectId },
      } as never);
      if (response.status !== 200) {
        throw await readApiResponseError(response, "Failed to load issue sheet columns");
      }
      const body = await response.json();
      return body.columns;
    },
  });
}
