"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useMemo, useRef, type KeyboardEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { readApiResponseError } from "@/lib/api-error";

import { IssueDetailDrawer } from "../../_components/issue-detail/issue-detail-drawer";
import { IssueListFiltersBar } from "../../_components/issue-list-filters-bar";
import { issueListStateToApiQuery } from "../../_components/issue-list-url-state";
import { useIssueDetailUrl } from "../../_components/use-issue-detail-url";
import { useIssueListUrlState } from "../../_components/use-issue-list-url-state";
import { IssuesActions } from "./issues-actions";
import { ISSUES_PAGE_SIZE, IssuesPageView, type OrganizationIssue } from "./issues-page-view";

const issuesQueryKey = (organizationSlug: string, query: Record<string, string>) =>
  ["organization-issues", organizationSlug, query] as const;

function organizationIssuesPath(organizationSlug: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/issues`;
}

type OrganizationIssuesResponse = {
  issues: OrganizationIssue[];
  total: number;
  summary: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    wontFix: number;
  };
};

type ProjectOption = { id: string; name: string };

export function IssuesPageContent({ organizationSlug }: { organizationSlug: string }) {
  const queryClient = useQueryClient();
  const { state, searchDraft, setSearchDraft, updateState, clearFilters } = useIssueListUrlState({
    includeProject: true,
  });
  const {
    isOpen: isDetailOpen,
    openIssueDetail,
    closeIssueDetail,
    issueProjectId,
  } = useIssueDetailUrl({
    includeProject: true,
    state,
    updateState,
  });
  const lastFocusedRowRef = useRef<HTMLTableRowElement | null>(null);
  const apiQuery = issueListStateToApiQuery(state, {
    includeProject: true,
    limit: ISSUES_PAGE_SIZE,
    offset: 0,
  });

  const projectsQuery = useQuery({
    queryKey: ["organization-issues-projects", organizationSlug],
    queryFn: async () => {
      const response = await fetch(`/api/orgs/${encodeURIComponent(organizationSlug)}/projects`);
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load projects");
      }
      const body = (await response.json()) as { projects: ProjectOption[] };
      return body.projects.map((project) => ({ id: project.id, name: project.name }));
    },
  });

  const issuesQuery = useInfiniteQuery({
    queryKey: issuesQueryKey(organizationSlug, apiQuery),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams(
        issueListStateToApiQuery(state, {
          includeProject: true,
          limit: ISSUES_PAGE_SIZE,
          offset: pageParam,
        }),
      );

      const response = await fetch(
        `${organizationIssuesPath(organizationSlug)}?${params.toString()}`,
      );

      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load issues");
      }

      return (await response.json()) as OrganizationIssuesResponse;
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.issues.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const issues = useMemo(
    () => issuesQuery.data?.pages.flatMap((page) => page.issues) ?? [],
    [issuesQuery.data?.pages],
  );
  const summary = issuesQuery.data?.pages[0]?.summary;
  const total = issuesQuery.data?.pages[0]?.total ?? 0;
  const hasMore = issues.length < total;

  const refreshIssues = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["organization-issues", organizationSlug],
    });
  };

  const openIssueRow = (issue: OrganizationIssue, row: HTMLTableRowElement) => {
    lastFocusedRowRef.current = row;
    openIssueDetail({ issueId: issue.id, projectId: issue.projectId });
  };

  const handleIssueRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    issue: OrganizationIssue,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openIssueRow(issue, event.currentTarget);
    }
  };

  const stopRowActivation = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  return (
    <>
      <IssuesPageView
        organizationSlug={organizationSlug}
        issues={issues}
        summary={summary}
        isLoading={issuesQuery.isLoading}
        isError={issuesQuery.isError}
        isFetchingMore={issuesQuery.isFetchingNextPage}
        hasMore={hasMore}
        selectedIssueId={state.issue}
        onIssueRowClick={openIssueRow}
        onIssueRowKeyDown={handleIssueRowKeyDown}
        onStopRowActivation={stopRowActivation}
        filterBar={
          <IssueListFiltersBar
            state={state}
            searchDraft={searchDraft}
            onSearchDraftChange={setSearchDraft}
            onStateChange={updateState}
            onClearFilters={clearFilters}
            projects={projectsQuery.data ?? []}
            searchPlaceholder="Search title, description, project, or source path"
          />
        }
        actions={
          <IssuesActions organizationSlug={organizationSlug} onIssuesChanged={refreshIssues} />
        }
        onLoadMore={() => {
          void issuesQuery.fetchNextPage();
        }}
      />
      <IssueDetailDrawer
        organizationSlug={organizationSlug}
        projectId={issueProjectId}
        issueId={state.issue}
        isOpen={isDetailOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeIssueDetail();
          }
        }}
        returnFocusRef={lastFocusedRowRef}
      />
    </>
  );
}
