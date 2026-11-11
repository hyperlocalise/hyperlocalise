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
import { useEffect, useState } from "react";

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

export type IssueSearchResult = {
  issueId: string;
  projectId: string;
  title: string;
  status: string;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

/** Live server-side search for a relationship target, scoped org-wide (not just the current project). */
export function useIssueRelationshipSearch({
  organizationSlug,
  excludeIssueId,
  query,
  enabled = true,
}: {
  organizationSlug: string;
  excludeIssueId: string;
  query: string;
  enabled?: boolean;
}) {
  const { client: goSvcClient } = useGoSvcClient();
  const debouncedQuery = useDebouncedValue(query, 300);

  return useQuery({
    queryKey: ["issue-relationship-search", organizationSlug, excludeIssueId, debouncedQuery],
    enabled,
    queryFn: async () => {
      try {
        const body = await goSvcClient.issueSheet.searchOrg(organizationSlug, {
          q: debouncedQuery,
          excludeIssueId,
          limit: 20,
        });
        return body.issues as IssueSearchResult[];
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to search issues"), { cause: error });
      }
    },
  });
}
