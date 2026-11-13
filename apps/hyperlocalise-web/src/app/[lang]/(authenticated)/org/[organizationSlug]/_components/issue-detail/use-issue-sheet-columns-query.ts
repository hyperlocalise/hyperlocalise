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
  const { client: goSvcClient } = useGoSvcClient();

  return useQuery({
    queryKey: issueSheetColumnsQueryKey(organizationSlug, projectId),
    enabled,
    queryFn: async () => {
      try {
        const body = await goSvcClient.issueSheet.columns.list(organizationSlug, projectId);
        return body.columns;
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load issue sheet columns"), {
          cause: error,
        });
      }
    },
  });
}
