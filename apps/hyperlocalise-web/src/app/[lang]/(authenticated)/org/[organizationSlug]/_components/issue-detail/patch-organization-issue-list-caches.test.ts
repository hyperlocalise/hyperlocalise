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
// @vitest-environment happy-dom

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vite-plus/test";

import {
  patchIssueSheetListCacheForAssignee,
  patchOrganizationIssueListCaches,
} from "./patch-organization-issue-list-caches";

const organizationSlug = "acme";
const projectId = "project_1";
const issueId = "issue_1";
const actorUserId = "user_actor";

describe("patchOrganizationIssueListCaches", () => {
  it("removes reassigned issues from my_work caches", () => {
    const queryClient = new QueryClient();
    const queryKey = [
      "organization-issues",
      organizationSlug,
      { view: "my_work", sort: "status", sortDir: "asc", limit: "50", offset: "0" },
    ] as const;

    queryClient.setQueryData(queryKey, {
      pages: [
        {
          total: 1,
          issues: [
            {
              id: issueId,
              assigneeUserId: actorUserId,
              assignee: "Actor",
            },
          ],
        },
      ],
    });

    patchOrganizationIssueListCaches(queryClient, {
      organizationSlug,
      issueId,
      assigneeUserId: "user_other",
      assignee: "Other",
      actorUserId,
    });

    const cached = queryClient.getQueryData<{
      pages: Array<{ total: number; issues: Array<{ id: string }> }>;
    }>(queryKey);
    expect(cached?.pages[0]?.issues).toEqual([]);
    expect(cached?.pages[0]?.total).toBe(0);
  });

  it("updates assignee fields when the issue still matches the cache filter", () => {
    const queryClient = new QueryClient();
    const queryKey = [
      "organization-issues",
      organizationSlug,
      { view: "all_open", sort: "status", sortDir: "asc", limit: "50", offset: "0" },
    ] as const;

    queryClient.setQueryData(queryKey, {
      pages: [
        {
          total: 1,
          issues: [
            {
              id: issueId,
              assigneeUserId: null,
              assignee: null,
            },
          ],
        },
      ],
    });

    patchOrganizationIssueListCaches(queryClient, {
      organizationSlug,
      issueId,
      assigneeUserId: actorUserId,
      assignee: "Actor",
      actorUserId,
    });

    const cached = queryClient.getQueryData<{
      pages: Array<{ issues: Array<{ assigneeUserId: string | null; assignee: string | null }> }>;
    }>(queryKey);
    expect(cached?.pages[0]?.issues[0]).toEqual({
      id: issueId,
      assigneeUserId: actorUserId,
      assignee: "Actor",
    });
  });
});

describe("patchIssueSheetListCacheForAssignee", () => {
  it("updates assignee fields in the project issue sheet cache", () => {
    const queryClient = new QueryClient();
    const queryKey = ["issue-sheet", organizationSlug, projectId] as const;

    queryClient.setQueryData(queryKey, {
      issues: [{ id: issueId, assigneeUserId: null, assignee: null }],
    });

    patchIssueSheetListCacheForAssignee(queryClient, {
      organizationSlug,
      projectId,
      issueId,
      assigneeUserId: actorUserId,
      assignee: "Actor",
    });

    const cached = queryClient.getQueryData<{
      issues: Array<{ assigneeUserId: string | null; assignee: string | null }>;
    }>(queryKey);
    expect(cached?.issues[0]).toEqual({
      id: issueId,
      assigneeUserId: actorUserId,
      assignee: "Actor",
    });
  });
});
