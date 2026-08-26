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

export type AssignableIssueMember = {
  userId: string;
  workosUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  avatarUrl: string | null;
  isCurrentUser: boolean;
};

export function assignableMembersQueryKey(organizationSlug: string, projectId: string) {
  return ["issue-assignable-members", organizationSlug, projectId] as const;
}

export function useAssignableIssueMembersQuery({
  organizationSlug,
  projectId,
  enabled = true,
}: {
  organizationSlug: string;
  projectId: string | undefined;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: assignableMembersQueryKey(organizationSlug, projectId ?? ""),
    enabled: Boolean(organizationSlug && projectId && enabled),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "issue-sheet"
      ]["assignable-members"].$get({
        param: { organizationSlug, projectId: projectId! },
      } as never);
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load assignable members");
      }
      return response.json();
    },
  });
}
