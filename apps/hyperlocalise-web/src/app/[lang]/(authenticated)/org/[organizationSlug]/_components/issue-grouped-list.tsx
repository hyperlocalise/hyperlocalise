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
import { useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

import { IssueAssigneeTableCell } from "./issue-detail/issue-assignee-table-cell";
import { IssuePriorityIcon } from "./issue-detail/issue-priority-icon";
import { IssueStatusIcon } from "./issue-detail/issue-status-icon";
import { buildIssueDetailHref, issueStatusLabel } from "./issue-detail/issue-detail-utils";
import {
  groupIssuesByStatus,
  type IssueListSummaryCounts,
  type IssueListStatus,
} from "./issue-list-group";
import { issueGroupedListMessages as messages } from "./issue-grouped-list.messages";
import { formatCompactRelativeTimestamp, formatRelativeTimestamp } from "./workspace-files-shared";

export type IssueGroupedListItem = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  targetLocale: string | null;
  assignee: string | null;
  assigneeUserId: string | null;
  updatedAt: string;
  priority?: string | null;
  projectName?: string;
};

function IssueRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="size-5 rounded-full" />
      <Skeleton className="h-4 w-64 max-w-[50%]" />
      <Skeleton className="ms-auto h-4 w-16" />
      <Skeleton className="size-6 rounded-full" />
      <Skeleton className="h-4 w-10" />
    </div>
  );
}

function StatusGroupHeader({
  status,
  count,
  collapsed,
  onToggle,
}: {
  status: IssueListStatus;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const intl = useIntl();
  const label = issueStatusLabel(intl, status);
  const chevron = collapsed ? ArrowRight01Icon : ArrowDown01Icon;

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/40"
      aria-expanded={!collapsed}
      aria-label={intl.formatMessage(
        collapsed ? messages.expandGroupAria : messages.collapseGroupAria,
        {
          status: label,
        },
      )}
      onClick={onToggle}
    >
      <HugeiconsIcon icon={chevron} strokeWidth={2} className="size-3.5 text-muted-foreground" />
      <IssueStatusIcon status={status} />
      <span>{label}</span>
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

export function IssueListRow({
  organizationSlug,
  issue,
  showProject,
  onActivate,
  onActivateKeyDown,
  selectionEnabled = false,
  selected = false,
  selectionDisabled = false,
  disableInlineEdits = false,
  onSelectionChange,
}: {
  organizationSlug: string;
  issue: IssueGroupedListItem;
  showProject?: boolean;
  onActivate: (issue: IssueGroupedListItem) => void;
  onActivateKeyDown: (event: KeyboardEvent<HTMLDivElement>, issue: IssueGroupedListItem) => void;
  selectionEnabled?: boolean;
  selected?: boolean;
  selectionDisabled?: boolean;
  disableInlineEdits?: boolean;
  onSelectionChange?: (issue: IssueGroupedListItem, checked: boolean) => void;
}) {
  const intl = useIntl();
  const emptyValue = intl.formatMessage(messages.emptyValue);
  const stopPropagation = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
      {selectionEnabled ? (
        <Checkbox
          checked={selected}
          disabled={selectionDisabled}
          aria-label={intl.formatMessage(messages.rowSelectAria, { title: issue.title })}
          onCheckedChange={(checked) => onSelectionChange?.(issue, checked === true)}
          onClick={stopPropagation}
        />
      ) : null}
      <div
        role="button"
        tabIndex={0}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => onActivate(issue)}
        onKeyDown={(event) => onActivateKeyDown(event, issue)}
      >
        <IssuePriorityIcon priority={issue.priority} size="sm" />
        <Link
          href={buildIssueDetailHref({
            organizationSlug,
            projectId: issue.projectId,
            issueId: issue.id,
          })}
          className="min-w-0 flex-1 truncate font-medium text-foreground hover:underline"
          onClick={stopPropagation}
          onKeyDown={stopPropagation}
        >
          {issue.title}
        </Link>
        {showProject && issue.projectName ? (
          <Link
            href={`/org/${organizationSlug}/projects/${encodeURIComponent(issue.projectId)}`}
            className="hidden max-w-[10rem] truncate text-muted-foreground hover:text-foreground hover:underline md:inline"
            onClick={stopPropagation}
            onKeyDown={stopPropagation}
          >
            {issue.projectName}
          </Link>
        ) : null}
        <span className="hidden w-16 shrink-0 truncate text-muted-foreground sm:inline">
          {issue.targetLocale ?? emptyValue}
        </span>
        <div className="shrink-0" onClick={stopPropagation} onKeyDown={stopPropagation}>
          <IssueAssigneeTableCell
            organizationSlug={organizationSlug}
            projectId={issue.projectId}
            issueId={issue.id}
            assigneeUserId={issue.assigneeUserId}
            assigneeLabel={issue.assignee}
            disabled={disableInlineEdits}
          />
        </div>
        <span
          className="w-10 shrink-0 text-end text-muted-foreground tabular-nums"
          title={formatRelativeTimestamp(issue.updatedAt)}
        >
          {formatCompactRelativeTimestamp(issue.updatedAt)}
        </span>
      </div>
    </div>
  );
}

export function IssueGroupedList<T extends IssueGroupedListItem>({
  organizationSlug,
  issues,
  summary,
  activeStatus,
  showProject,
  isLoading,
  isError,
  isFetchingMore,
  hasMore,
  empty,
  error,
  loadMoreLabel,
  loadingMoreLabel,
  onLoadMore,
  onIssueActivate,
  className,
  selectionEnabled = false,
  isIssueSelected,
  selectionDisabled = false,
  disableInlineEdits = false,
  onIssueSelectionChange,
}: {
  organizationSlug: string;
  issues: T[];
  summary?: IssueListSummaryCounts;
  activeStatus?: string;
  showProject?: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  empty: ReactNode;
  error: ReactNode;
  loadMoreLabel?: ReactNode;
  loadingMoreLabel?: ReactNode;
  onLoadMore?: () => void;
  onIssueActivate: (issue: T) => void;
  className?: string;
  selectionEnabled?: boolean;
  isIssueSelected?: (issue: T) => boolean;
  selectionDisabled?: boolean;
  disableInlineEdits?: boolean;
  onIssueSelectionChange?: (issue: T, checked: boolean) => void;
}) {
  const intl = useIntl();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = groupIssuesByStatus(issues, { activeStatus, summary });
  // Only a single-status filter hides headers. Do not use groups.length —
  // pagination may have loaded only one status so far while summary spans more.
  const hideHeaders = Boolean(activeStatus);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, issue: T) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onIssueActivate(issue);
    }
  };

  if (isLoading) {
    return (
      <div
        className={cn("overflow-hidden rounded-xl border bg-card", className)}
        aria-busy="true"
        aria-label={intl.formatMessage(messages.loadingAria)}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <IssueRowSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className={cn(
          "rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className={cn("rounded-xl border bg-card px-4 py-12 text-center", className)}>
        {empty}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
        {groups.map((group, groupIndex) => {
          // When headers are hidden there is no expand control, so never keep
          // a previously collapsed section empty.
          const isCollapsed = hideHeaders ? false : (collapsed[group.status] ?? false);
          return (
            <section
              key={group.status}
              className={cn(groupIndex > 0 && "border-t")}
              data-status-group={group.status}
            >
              {hideHeaders ? null : (
                <StatusGroupHeader
                  status={group.status}
                  count={group.count}
                  collapsed={isCollapsed}
                  onToggle={() =>
                    setCollapsed((current) => ({
                      ...current,
                      [group.status]: !isCollapsed,
                    }))
                  }
                />
              )}
              {isCollapsed ? null : (
                <div className={cn(!hideHeaders && "border-t border-border/60")}>
                  {group.issues.map((issue) => (
                    <IssueListRow
                      key={`${issue.projectId}:${issue.id}`}
                      organizationSlug={organizationSlug}
                      issue={issue}
                      showProject={showProject}
                      selectionEnabled={selectionEnabled}
                      selected={isIssueSelected?.(issue as T) ?? false}
                      selectionDisabled={selectionDisabled}
                      disableInlineEdits={disableInlineEdits}
                      onSelectionChange={(item, checked) =>
                        onIssueSelectionChange?.(item as T, checked)
                      }
                      onActivate={(item) => onIssueActivate(item as T)}
                      onActivateKeyDown={(event, item) => handleKeyDown(event, item as T)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {isFetchingMore
          ? Array.from({ length: 3 }).map((_, index) => <IssueRowSkeleton key={`more-${index}`} />)
          : null}
      </div>

      {hasMore && onLoadMore ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={onLoadMore}
            disabled={isFetchingMore}
            className="rounded-full"
          >
            {isFetchingMore ? (loadingMoreLabel ?? "Loading...") : (loadMoreLabel ?? "Load more")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
