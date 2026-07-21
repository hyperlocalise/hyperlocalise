"use client";

import type { KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import { ClipboardListIcon } from "@hugeicons/core-free-icons";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

import { issueStatusVariant } from "../../_components/issue-detail/issue-detail-utils";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { formatRelativeTimestamp } from "../../_components/workspace-files-shared";
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
  createdAt: string;
  updatedAt: string;
};

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function IssueRowSkeleton() {
  return (
    <tr>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-2 h-3 w-full max-w-xs" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-6 w-28 rounded-full" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-16" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-32" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-20" />
      </td>
    </tr>
  );
}

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
  onLoadMore,
  selectedIssueId,
  onIssueRowClick,
  onIssueRowKeyDown,
  onStopRowActivation,
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
  onLoadMore: () => void;
  selectedIssueId?: string;
  onIssueRowClick: (issue: OrganizationIssue, row: HTMLTableRowElement) => void;
  onIssueRowKeyDown: (event: KeyboardEvent<HTMLTableRowElement>, issue: OrganizationIssue) => void;
  onStopRowActivation: (event: { stopPropagation: () => void }) => void;
}) {
  const intl = useIntl();

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={ClipboardListIcon}
        label="Workspace"
        title="Issues"
        description="Open issues across all projects in this workspace."
        actions={actions}
      />

      {filterBar}

      {summary ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            <FormattedMessage
              {...issuesPageViewMessages.summaryTotal}
              values={{ count: summary.total }}
            />
          </Badge>
          <Badge variant="secondary">
            <FormattedMessage
              {...issuesPageViewMessages.summaryOpen}
              values={{ count: summary.open }}
            />
          </Badge>
          <Badge variant="warning">
            <FormattedMessage
              {...issuesPageViewMessages.summaryInProgress}
              values={{ count: summary.inProgress }}
            />
          </Badge>
          <Badge variant="success">
            <FormattedMessage
              {...issuesPageViewMessages.summaryResolved}
              values={{ count: summary.resolved }}
            />
          </Badge>
        </div>
      ) : isLoading ? (
        <div
          className="flex flex-wrap gap-2"
          aria-busy="true"
          aria-label={intl.formatMessage(issuesPageViewMessages.loadingSummaryAria)}
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-6 w-20 rounded-full" />
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-56 px-4 py-3 font-medium">
                <FormattedMessage {...issuesPageViewMessages.columnIssue} />
              </th>
              <th className="px-4 py-3 font-medium">
                <FormattedMessage {...issuesPageViewMessages.columnStatus} />
              </th>
              <th className="px-4 py-3 font-medium">
                <FormattedMessage {...issuesPageViewMessages.columnType} />
              </th>
              <th className="px-4 py-3 font-medium">
                <FormattedMessage {...issuesPageViewMessages.columnProject} />
              </th>
              <th className="px-4 py-3 font-medium">
                <FormattedMessage {...issuesPageViewMessages.columnLocale} />
              </th>
              <th className="px-4 py-3 font-medium">
                <FormattedMessage {...issuesPageViewMessages.columnUpdated} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => <IssueRowSkeleton key={index} />)
            ) : isError ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <FormattedMessage {...issuesPageViewMessages.loadError} />
                </td>
              </tr>
            ) : issues.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <FormattedMessage {...issuesPageViewMessages.empty} />
                </td>
              </tr>
            ) : (
              issues.map((issue) => (
                <tr
                  key={`${issue.projectId}:${issue.id}`}
                  tabIndex={0}
                  aria-current={selectedIssueId === issue.id ? "true" : undefined}
                  className={cn(
                    "align-top cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selectedIssueId === issue.id && "bg-muted/40",
                  )}
                  onClick={(event) => onIssueRowClick(issue, event.currentTarget)}
                  onKeyDown={(event) => onIssueRowKeyDown(event, issue)}
                >
                  <td className="max-w-80 px-4 py-3">
                    <span className="font-medium text-foreground">{issue.title}</span>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {issue.description ||
                        issue.sourcePath ||
                        intl.formatMessage(issuesPageViewMessages.noDetailsYet)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={issueStatusVariant(issue.status)}
                      className="rounded-full capitalize"
                    >
                      {formatLabel(issue.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatLabel(issue.issueType)}
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={onStopRowActivation}
                    onKeyDown={onStopRowActivation}
                  >
                    <Link
                      href={`/org/${organizationSlug}/projects/${encodeURIComponent(issue.projectId)}`}
                      className="text-foreground hover:underline"
                    >
                      {issue.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {issue.targetLocale ?? intl.formatMessage(issuesPageViewMessages.emptyValue)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatRelativeTimestamp(issue.updatedAt)}
                  </td>
                </tr>
              ))
            )}
            {isFetchingMore
              ? Array.from({ length: 3 }).map((_, index) => (
                  <IssueRowSkeleton key={`more-${index}`} />
                ))
              : null}
          </tbody>
        </table>
      </div>

      {hasMore && !isLoading ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={onLoadMore}
            disabled={isFetchingMore}
            className="rounded-full"
          >
            {isFetchingMore ? (
              <FormattedMessage {...issuesPageViewMessages.loadingMore} />
            ) : (
              <FormattedMessage {...issuesPageViewMessages.loadMore} />
            )}
          </Button>
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
