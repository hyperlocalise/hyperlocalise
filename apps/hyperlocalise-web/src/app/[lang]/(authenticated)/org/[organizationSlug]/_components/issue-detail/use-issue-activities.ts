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

import { readApiResponseError } from "@/lib/api-error";

import { issueSheetApiPath } from "./issue-detail-utils";

export type IssueActivityUser = {
  userId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
};

type IssueActivityBase = {
  id: string;
  actor: IssueActivityUser | null;
  createdAt: string;
};

export type IssueActivity =
  | (IssueActivityBase & {
      type: "assignee_changed";
      previousAssignee: IssueActivityUser | null;
      nextAssignee: IssueActivityUser | null;
    })
  | (IssueActivityBase & {
      type: "issue_created";
    })
  | (IssueActivityBase & {
      type: "status_changed";
      previousStatus: string;
      nextStatus: string;
    });

const ACTIVITIES_PAGE_SIZE = 100;

export function issueActivitiesQueryKey(
  organizationSlug: string,
  projectId: string,
  issueId: string,
) {
  return ["issue-activities", organizationSlug, projectId, issueId] as const;
}

export function useIssueActivitiesQuery({
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
  return useQuery({
    queryKey: issueActivitiesQueryKey(organizationSlug, projectId, issueId),
    enabled: Boolean(organizationSlug && projectId && issueId && enabled),
    queryFn: async () => {
      const activities: IssueActivity[] = [];
      let total = 0;
      let offset = 0;

      while (true) {
        const params = new URLSearchParams({
          limit: String(ACTIVITIES_PAGE_SIZE),
          offset: String(offset),
        });
        const response = await fetch(
          `${issueSheetApiPath(organizationSlug, projectId)}/${encodeURIComponent(issueId)}/activities?${params}`,
        );
        if (!response.ok) {
          throw await readApiResponseError(response, "Failed to load issue activities");
        }
        const page = (await response.json()) as { activities: IssueActivity[]; total: number };
        total = page.total;
        activities.push(...page.activities);

        offset += page.activities.length;
        if (page.activities.length === 0 || offset >= total) {
          break;
        }
      }

      return { activities, total };
    },
  });
}
