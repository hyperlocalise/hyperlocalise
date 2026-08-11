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
import {
  ISSUE_LIST_SORT_DIRECTIONS,
  ISSUE_LIST_SORT_FIELDS,
  ISSUE_LIST_VIEWS,
  type IssueListSortDirection,
  type IssueListSortField,
  type IssueListView,
  type IssuePriority,
} from "./issue-list-constants";

export type IssueListAssigneeFilterQuery = {
  view?: IssueListView;
  assignee?: string;
  status?: string;
  issueType?: string;
  priority?: IssuePriority;
  locale?: string;
  projectId?: string;
  search?: string;
  sort?: IssueListSortField;
  sortDir?: IssueListSortDirection;
};

/**
 * Client-side mirror of assignee-related predicates from issue list filtering.
 * Used to drop rows from filtered organization-issue list caches after an
 * assignee change.
 */
export function issueMatchesAssigneeListQuery(input: {
  assigneeUserId: string | null;
  query: IssueListAssigneeFilterQuery;
  actorUserId: string;
}): boolean {
  const { assigneeUserId, query, actorUserId } = input;
  const view = query.view;
  const hasAssigneeFilter = Boolean(query.assignee);

  if (view === "my_work" && !hasAssigneeFilter && assigneeUserId !== actorUserId) {
    return false;
  }
  if (view === "qa_triage" && !hasAssigneeFilter && assigneeUserId != null) {
    return false;
  }
  if (query.assignee === "me") {
    return assigneeUserId === actorUserId;
  }
  if (query.assignee === "unassigned") {
    return assigneeUserId == null;
  }
  if (query.assignee) {
    return assigneeUserId === query.assignee;
  }
  return true;
}

export function parseIssueListFilterQueryFromApiQuery(
  query: Record<string, string>,
): IssueListAssigneeFilterQuery {
  const view = ISSUE_LIST_VIEWS.find((value) => value === query.view);
  const sort = ISSUE_LIST_SORT_FIELDS.find((value) => value === query.sort);
  const sortDir = ISSUE_LIST_SORT_DIRECTIONS.find((value) => value === query.sortDir);

  return {
    view,
    status: query.status,
    issueType: query.issueType,
    priority: query.priority as IssuePriority | undefined,
    locale: query.locale,
    assignee: query.assignee,
    projectId: query.projectId,
    search: query.search,
    sort,
    sortDir,
  };
}
