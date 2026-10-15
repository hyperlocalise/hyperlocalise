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

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

export type IssueSubscriber = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

export function issueSubscribersQueryKey(
  organizationSlug: string,
  projectId: string,
  issueId: string,
) {
  return ["issue-subscribers", organizationSlug, projectId, issueId] as const;
}

export function useIssueSubscribersQuery({
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

  return useQuery({
    queryKey: issueSubscribersQueryKey(organizationSlug, projectId, issueId),
    enabled,
    queryFn: async () => {
      try {
        const body = (await goSvcClient.issueSheet.subscriptions(
          organizationSlug,
          projectId,
          issueId,
        )) as { subscribers: IssueSubscriber[] };
        return body.subscribers;
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load issue subscribers"), {
          cause: error,
        });
      }
    },
  });
}
