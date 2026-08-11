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
import type { ReactNode } from "react";
import { ClipboardListIcon } from "@hugeicons/core-free-icons";
import { FormattedMessage, useIntl } from "react-intl";

import { IssueGroupedList } from "../../_components/issue-grouped-list";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { issuesPageViewMessages } from "./issues-page-view.messages";

export const ISSUES_PAGE_SIZE = 50;

export type OrganizationIssue = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  issueType: string;
  status: string;
  targetLocale: string | null;
  sourcePath: string | null;
  linkKind: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  reporter: string | null;
  assignee: string | null;
  assigneeUserId: string | null;
  createdAt: string;
  updatedAt: string;
  priority?: string | null;
};

export function IssuesPageView({
  organizationSlug,
  issues,
  summary,
  isLoading,
  isError,
  isFetchingMore,
  hasMore,
  actions,
  filterBar,
  activeStatus,
  onLoadMore,
  onIssueRowClick,
}: {
  organizationSlug: string;
  issues: OrganizationIssue[];
  summary?: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    wontFix: number;
  };
  isLoading: boolean;
  isError: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  actions?: ReactNode;
  filterBar: ReactNode;
  activeStatus?: string;
  onLoadMore: () => void;
  onIssueRowClick: (issue: OrganizationIssue) => void;
}) {
  const intl = useIntl();

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={ClipboardListIcon}
        label="Workspace"
        title="Issues"
        description={intl.formatMessage(issuesPageViewMessages.pageDescription)}
        actions={actions}
      />

      {filterBar}

      <IssueGroupedList
        organizationSlug={organizationSlug}
        issues={issues}
        summary={summary}
        activeStatus={activeStatus}
        showProject
        isLoading={isLoading}
        isError={isError}
        isFetchingMore={isFetchingMore}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        onIssueActivate={onIssueRowClick}
        loadMoreLabel={<FormattedMessage {...issuesPageViewMessages.loadMore} />}
        loadingMoreLabel={<FormattedMessage {...issuesPageViewMessages.loadingMore} />}
        empty={<FormattedMessage {...issuesPageViewMessages.empty} />}
        error={<FormattedMessage {...issuesPageViewMessages.loadError} />}
      />
    </WorkspacePageShell>
  );
}
