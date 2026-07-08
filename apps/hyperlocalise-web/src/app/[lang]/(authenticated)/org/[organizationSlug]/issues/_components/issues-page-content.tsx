"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import { readApiResponseError } from "@/lib/api-error";

import { IssuesActions } from "./issues-actions";
import { ISSUES_PAGE_SIZE, IssuesPageView, type OrganizationIssue } from "./issues-page-view";

const issuesQueryKey = (organizationSlug: string, view: string, search: string) =>
  ["organization-issues", organizationSlug, view, search] as const;

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

export function IssuesPageContent({ organizationSlug }: { organizationSlug: string }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"all_open" | "my_work" | "qa_triage" | "source_context">(
    "all_open",
  );
  const [search, setSearch] = useState("");

  const issuesQuery = useInfiniteQuery({
    queryKey: issuesQueryKey(organizationSlug, view, search),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        view,
        limit: String(ISSUES_PAGE_SIZE),
        offset: String(pageParam),
      });
      const trimmedSearch = search.trim();
      if (trimmedSearch) {
        params.set("search", trimmedSearch);
      }

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

  return (
    <IssuesPageView
      organizationSlug={organizationSlug}
      issues={issues}
      summary={summary}
      view={view}
      search={search}
      isLoading={issuesQuery.isLoading}
      isError={issuesQuery.isError}
      isFetchingMore={issuesQuery.isFetchingNextPage}
      hasMore={hasMore}
      actions={
        <IssuesActions organizationSlug={organizationSlug} onIssuesChanged={refreshIssues} />
      }
      onViewChange={setView}
      onSearchChange={setSearch}
      onLoadMore={() => {
        void issuesQuery.fetchNextPage();
      }}
    />
  );
}
