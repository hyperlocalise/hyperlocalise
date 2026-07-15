import {
  ISSUE_LIST_SORT_DIRECTIONS,
  ISSUE_LIST_SORT_FIELDS,
  ISSUE_LIST_VIEWS,
  ISSUE_PRIORITIES,
  type IssueListSortDirection,
  type IssueListSortField,
  type IssueListView,
  type IssuePriority,
} from "@/lib/projects/issue-sheet/issue-list-query";

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

  return {
    view,
    status,
    issueType,
    priority,
    locale,
    assignee,
    projectId,
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
  };
}

export function getActiveIssueFilterChips(
  state: IssueListUrlState,
  options?: {
    includeProject?: boolean;
    projectNameById?: Record<string, string>;
  },
) {
  const chips: Array<{ key: keyof IssueListUrlState; label: string }> = [];
  if (state.status) {
    chips.push({ key: "status", label: `Status: ${formatIssueFilterLabel(state.status)}` });
  }
  if (state.issueType) {
    chips.push({ key: "issueType", label: `Type: ${formatIssueFilterLabel(state.issueType)}` });
  }
  if (state.priority) {
    chips.push({ key: "priority", label: `Priority: ${state.priority}` });
  }
  if (state.locale) {
    chips.push({ key: "locale", label: `Locale: ${state.locale}` });
  }
  if (state.assignee) {
    chips.push({
      key: "assignee",
      label: state.assignee === "me" ? "Assignee: Me" : "Assignee: Unassigned",
    });
  }
  if (options?.includeProject && state.projectId) {
    const projectName = options.projectNameById?.[state.projectId] ?? state.projectId;
    chips.push({ key: "projectId", label: `Project: ${projectName}` });
  }
  if (state.search.trim()) {
    chips.push({ key: "search", label: `Search: ${state.search.trim()}` });
  }
  return chips;
}

export function formatIssueFilterLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
