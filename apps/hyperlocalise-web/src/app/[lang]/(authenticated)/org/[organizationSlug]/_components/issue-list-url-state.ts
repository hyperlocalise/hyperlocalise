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
import {
  ISSUE_LIST_SORT_DIRECTIONS,
  ISSUE_LIST_SORT_FIELDS,
  ISSUE_LIST_VIEWS,
  ISSUE_PRIORITIES,
  type IssueListSortDirection,
  type IssueListSortField,
  type IssueListView,
  type IssuePriority,
} from "@/lib/projects/issue-sheet/issue-list-constants";

export const ISSUE_STATUS_FILTERS = ["open", "in_progress", "resolved", "wont_fix"] as const;

export const ISSUE_TYPE_FILTERS = [
  "general_question",
  "translation_mistake",
  "context_request",
  "source_mistake",
  "glossary_violation",
  "qa_failure",
] as const;

export const ISSUE_ASSIGNEE_FILTERS = ["me", "unassigned"] as const;

export type IssueStatusFilter = (typeof ISSUE_STATUS_FILTERS)[number];
export type IssueTypeFilter = (typeof ISSUE_TYPE_FILTERS)[number];
export type IssueAssigneeFilter = (typeof ISSUE_ASSIGNEE_FILTERS)[number];

export type IssueListUrlState = {
  view: IssueListView;
  status?: IssueStatusFilter;
  issueType?: IssueTypeFilter;
  priority?: IssuePriority;
  locale?: string;
  assignee?: IssueAssigneeFilter;
  projectId?: string;
  issue?: string;
  issueProject?: string;
  search: string;
  sort: IssueListSortField;
  sortDir: IssueListSortDirection;
};

const DEFAULT_STATE: IssueListUrlState = {
  view: "all_open",
  search: "",
  sort: "updated_at",
  sortDir: "desc",
};

function readAllowedValue<T extends string>(
  searchParams: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = searchParams.get(key);
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return undefined;
}

export function parseIssueListSearchParams(
  searchParams: URLSearchParams,
  options?: { includeProject?: boolean },
): IssueListUrlState {
  const view = readAllowedValue(searchParams, "view", ISSUE_LIST_VIEWS) ?? DEFAULT_STATE.view;
  const sort = readAllowedValue(searchParams, "sort", ISSUE_LIST_SORT_FIELDS) ?? DEFAULT_STATE.sort;
  const sortDir =
    readAllowedValue(searchParams, "sortDir", ISSUE_LIST_SORT_DIRECTIONS) ?? DEFAULT_STATE.sortDir;
  const status = readAllowedValue(searchParams, "status", ISSUE_STATUS_FILTERS);
  const issueType = readAllowedValue(searchParams, "issueType", ISSUE_TYPE_FILTERS);
  const priority = readAllowedValue(searchParams, "priority", ISSUE_PRIORITIES);
  const assignee = readAllowedValue(searchParams, "assignee", ISSUE_ASSIGNEE_FILTERS);
  const locale = searchParams.get("locale")?.trim() || undefined;
  const search = searchParams.get("search")?.trim() ?? "";
  const projectId = options?.includeProject
    ? searchParams.get("projectId")?.trim() || undefined
    : undefined;
  const issue = searchParams.get("issue")?.trim() || undefined;
  const issueProject = searchParams.get("issueProject")?.trim() || undefined;

  return {
    view,
    status,
    issueType,
    priority,
    locale,
    assignee,
    projectId,
    issue,
    issueProject,
    search,
    sort,
    sortDir,
  };
}

export function buildIssueListSearchParams(
  state: IssueListUrlState,
  options?: { includeProject?: boolean },
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.view !== DEFAULT_STATE.view) {
    params.set("view", state.view);
  }
  if (state.status) {
    params.set("status", state.status);
  }
  if (state.issueType) {
    params.set("issueType", state.issueType);
  }
  if (state.priority) {
    params.set("priority", state.priority);
  }
  if (state.locale) {
    params.set("locale", state.locale);
  }
  if (state.assignee) {
    params.set("assignee", state.assignee);
  }
  if (options?.includeProject && state.projectId) {
    params.set("projectId", state.projectId);
  }
  if (state.issue) {
    params.set("issue", state.issue);
  }
  if (state.issueProject) {
    params.set("issueProject", state.issueProject);
  }
  if (state.search.trim()) {
    params.set("search", state.search.trim());
  }
  if (state.sort !== DEFAULT_STATE.sort) {
    params.set("sort", state.sort);
  }
  if (state.sortDir !== DEFAULT_STATE.sortDir) {
    params.set("sortDir", state.sortDir);
  }
  return params;
}

export function buildIssueListHref(
  pathname: string,
  state: IssueListUrlState,
  options?: { includeProject?: boolean },
) {
  const params = buildIssueListSearchParams(state, options);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function clearIssueListFilters(state: IssueListUrlState): IssueListUrlState {
  return {
    view: state.view,
    search: "",
    sort: state.sort,
    sortDir: state.sortDir,
    issue: state.issue,
    issueProject: state.issueProject,
  };
}

export function stripIssueDetailFromState(state: IssueListUrlState): IssueListUrlState {
  return {
    ...state,
    issue: undefined,
    issueProject: undefined,
  };
}

export type IssueFilterChip =
  | { key: "status"; value: IssueStatusFilter }
  | { key: "issueType"; value: IssueTypeFilter }
  | { key: "priority"; value: IssuePriority }
  | { key: "locale"; value: string }
  | { key: "assignee"; value: IssueAssigneeFilter }
  | { key: "projectId"; value: string; projectName: string }
  | { key: "search"; value: string };

export function getActiveIssueFilterChips(
  state: IssueListUrlState,
  options?: {
    includeProject?: boolean;
    projectNameById?: Record<string, string>;
  },
): IssueFilterChip[] {
  const chips: IssueFilterChip[] = [];
  if (state.status) {
    chips.push({ key: "status", value: state.status });
  }
  if (state.issueType) {
    chips.push({ key: "issueType", value: state.issueType });
  }
  if (state.priority) {
    chips.push({ key: "priority", value: state.priority });
  }
  if (state.locale) {
    chips.push({ key: "locale", value: state.locale });
  }
  if (state.assignee) {
    chips.push({ key: "assignee", value: state.assignee });
  }
  if (options?.includeProject && state.projectId) {
    const projectName = options.projectNameById?.[state.projectId] ?? state.projectId;
    chips.push({ key: "projectId", value: state.projectId, projectName });
  }
  if (state.search.trim()) {
    chips.push({ key: "search", value: state.search.trim() });
  }
  return chips;
}

export function defaultSortDirForField(sort: IssueListSortField): IssueListSortDirection {
  return sort === "priority" || sort === "status" ? "asc" : "desc";
}

export function issueListStateToApiQuery(
  state: IssueListUrlState,
  options?: { includeProject?: boolean; limit?: number; offset?: number },
) {
  const query: Record<string, string> = {
    view: state.view,
    sort: state.sort,
    sortDir: state.sortDir,
    limit: String(options?.limit ?? 50),
    offset: String(options?.offset ?? 0),
  };
  if (state.status) {
    query.status = state.status;
  }
  if (state.issueType) {
    query.issueType = state.issueType;
  }
  if (state.priority) {
    query.priority = state.priority;
  }
  if (state.locale) {
    query.locale = state.locale;
  }
  if (state.assignee) {
    query.assignee = state.assignee;
  }
  if (options?.includeProject && state.projectId) {
    query.projectId = state.projectId;
  }
  if (state.search.trim()) {
    query.search = state.search.trim();
  }
  return query;
}
