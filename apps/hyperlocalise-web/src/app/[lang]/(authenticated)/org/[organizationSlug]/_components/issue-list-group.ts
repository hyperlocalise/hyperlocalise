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

export const ISSUE_LIST_STATUS_ORDER = [
  "open",
  "in_progress",
  "resolved",
  "wont_fix",
] as const;

export type IssueListStatus = (typeof ISSUE_LIST_STATUS_ORDER)[number];

export type IssueListSummaryCounts = {
  open: number;
  inProgress: number;
  resolved: number;
  wontFix: number;
};

export type IssueStatusGroup<T extends { status: string }> = {
  status: IssueListStatus;
  issues: T[];
  count: number;
};

function summaryCountForStatus(
  status: IssueListStatus,
  summary?: IssueListSummaryCounts,
): number | undefined {
  if (!summary) {
    return undefined;
  }
  switch (status) {
    case "open":
      return summary.open;
    case "in_progress":
      return summary.inProgress;
    case "resolved":
      return summary.resolved;
    case "wont_fix":
      return summary.wontFix;
  }
}

export function groupIssuesByStatus<T extends { status: string }>(
  issues: T[],
  options?: {
    activeStatus?: string;
    summary?: IssueListSummaryCounts;
  },
): IssueStatusGroup<T>[] {
  const activeStatus = options?.activeStatus;
  const statuses = activeStatus
    ? ISSUE_LIST_STATUS_ORDER.filter((status) => status === activeStatus)
    : ISSUE_LIST_STATUS_ORDER;

  const grouped = new Map<string, T[]>();
  for (const status of ISSUE_LIST_STATUS_ORDER) {
    grouped.set(status, []);
  }
  for (const issue of issues) {
    const bucket = grouped.get(issue.status);
    if (bucket) {
      bucket.push(issue);
    }
  }

  return statuses.flatMap((status) => {
    const groupIssues = grouped.get(status) ?? [];
    const summaryCount = summaryCountForStatus(status, options?.summary);
    const count = summaryCount ?? groupIssues.length;
    if (!activeStatus && groupIssues.length === 0 && count === 0) {
      return [];
    }
    if (!activeStatus && groupIssues.length === 0) {
      return [];
    }
    return [{ status, issues: groupIssues, count }];
  });
}
