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
  const { client: goSvcClient } = useGoSvcClient();

  return useQuery({
    queryKey: organizationIssueQueryKey(organizationSlug, issueId ?? ""),
    enabled: enabled && Boolean(issueId),
    queryFn: async () => {
      try {
        const body = await goSvcClient.issueSheet.getOrg(organizationSlug, issueId!);
        return body.issue;
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load issue"), { cause: error });
      }
    },
  });
}
