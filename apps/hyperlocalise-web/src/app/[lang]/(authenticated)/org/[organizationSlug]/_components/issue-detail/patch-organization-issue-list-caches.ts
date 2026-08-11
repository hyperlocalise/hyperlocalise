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
import type { QueryClient } from "@tanstack/react-query";

import {
  issueMatchesAssigneeListQuery,
  parseIssueListFilterQueryFromApiQuery,
} from "@/lib/projects/issue-sheet/issue-list-assignee-filter";

type OrganizationIssuesPage = {
  issues: Array<Record<string, unknown>>;
  total: number;
  summary?: Record<string, number>;
};

type OrganizationIssuesInfiniteData = {
  pages: OrganizationIssuesPage[];
};

export function patchOrganizationIssueListCaches(
  queryClient: QueryClient,
  input: {
    organizationSlug: string;
    issueId: string;
    assigneeUserId: string | null;
    assignee: string | null;
    actorUserId: string;
  },
) {
  const queries = queryClient.getQueryCache().findAll({
    queryKey: ["organization-issues", input.organizationSlug],
  });

  for (const query of queries) {
    const apiQuery = query.queryKey[2];
    if (!apiQuery || typeof apiQuery !== "object" || Array.isArray(apiQuery)) {
      continue;
    }

    const filterQuery = parseIssueListFilterQueryFromApiQuery(apiQuery as Record<string, string>);
    const stillMatches = issueMatchesAssigneeListQuery({
      assigneeUserId: input.assigneeUserId,
      query: filterQuery,
      actorUserId: input.actorUserId,
    });

    queryClient.setQueryData(query.queryKey, (current: unknown) => {
      if (!current || typeof current !== "object") {
        return current;
      }

      const data = current as OrganizationIssuesInfiniteData;
      if (!Array.isArray(data.pages)) {
        return current;
      }

      let removed = false;
      const pages = data.pages.map((page) => {
        const issues = page.issues ?? [];
        if (!issues.some((row) => row.id === input.issueId)) {
          return page;
        }

        if (!stillMatches) {
          removed = true;
          return {
            ...page,
            issues: issues.filter((row) => row.id !== input.issueId),
          };
        }

        return {
          ...page,
          issues: issues.map((row) =>
            row.id === input.issueId
              ? {
                  ...row,
                  assigneeUserId: input.assigneeUserId,
                  assignee: input.assignee,
                }
              : row,
          ),
        };
      });

      if (!removed) {
        return { ...data, pages };
      }

      return {
        ...data,
        pages: pages.map((page, pageIndex) =>
          pageIndex === 0
            ? {
                ...page,
                total: Math.max(0, page.total - 1),
              }
            : page,
        ),
      };
    });
  }
}

export function patchIssueSheetListCacheForAssignee(
  queryClient: QueryClient,
  input: {
    organizationSlug: string;
    projectId: string;
    issueId: string;
    assigneeUserId: string | null;
    assignee: string | null;
  },
) {
  queryClient.setQueriesData(
    { queryKey: ["issue-sheet", input.organizationSlug, input.projectId] },
    (current: unknown) => {
      if (!current || typeof current !== "object") {
        return current;
      }
      const data = current as { issues?: Array<Record<string, unknown>> };
      if (!Array.isArray(data.issues)) {
        return current;
      }
      return {
        ...current,
        issues: data.issues.map((row) =>
          row.id === input.issueId
            ? {
                ...row,
                assigneeUserId: input.assigneeUserId,
                assignee: input.assignee,
              }
            : row,
        ),
      };
    },
  );
}
