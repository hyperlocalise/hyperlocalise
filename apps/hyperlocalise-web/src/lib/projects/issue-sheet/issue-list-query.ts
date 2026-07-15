import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { schema } from "@/lib/database";

import {
  type IssueListSortDirection,
  type IssueListSortField,
  type IssueListView,
  type IssuePriority,
} from "./issue-list-constants";

export type {
  IssueListSortDirection,
  IssueListSortField,
  IssueListView,
  IssuePriority,
} from "./issue-list-constants";
export {
  ISSUE_LIST_SORT_DIRECTIONS,
  ISSUE_LIST_SORT_FIELDS,
  ISSUE_LIST_VIEWS,
  ISSUE_PRIORITIES,
} from "./issue-list-constants";

export type IssueListFilterQuery = {
  view?: IssueListView;
  status?: "open" | "in_progress" | "resolved" | "wont_fix" | "all";
  issueType?:
    | "general_question"
    | "translation_mistake"
    | "context_request"
    | "source_mistake"
    | "glossary_violation"
    | "qa_failure"
    | "all";
  priority?: IssuePriority;
  locale?: string;
  assignee?: string;
  projectId?: string;
  search?: string;
  sort?: IssueListSortField;
  sortDir?: IssueListSortDirection;
};

const OPEN_STATUSES = ["open", "in_progress"] as const;
const SOURCE_CONTEXT_TYPES = ["source_mistake", "context_request", "general_question"] as const;

export const priorityColumns = alias(schema.issueSheetColumns, "issue_priority_columns");
export const priorityValues = alias(schema.issueSheetRowValues, "issue_priority_values");

export const priorityColumnJoin = and(
  eq(priorityColumns.organizationId, schema.issueSheetIssues.organizationId),
  eq(priorityColumns.projectId, schema.issueSheetIssues.projectId),
  eq(priorityColumns.key, "priority"),
);

export const priorityValueJoin = and(
  eq(priorityValues.issueId, schema.issueSheetIssues.id),
  eq(priorityValues.columnId, priorityColumns.id),
);

const priorityRankExpression = sql<number>`case
  when ${priorityValues.value} #>> '{}' = 'P0' then 0
  when ${priorityValues.value} #>> '{}' = 'P1' then 1
  when ${priorityValues.value} #>> '{}' = 'P2' then 2
  else 3
end`;

const statusRankExpression = sql<number>`case
  when ${schema.issueSheetIssues.status} = 'open' then 0
  when ${schema.issueSheetIssues.status} = 'in_progress' then 1
  when ${schema.issueSheetIssues.status} = 'resolved' then 2
  when ${schema.issueSheetIssues.status} = 'wont_fix' then 3
  else 4
end`;

export function buildIssueListFilterConditions(input: {
  actorUserId: string;
  query: IssueListFilterQuery;
  searchTargets?: SQL[];
}) {
  const conditions: SQL[] = [];
  const query = input.query;
  const view = query.view;
  const hasStatusFilter = Boolean(query.status && query.status !== "all");
  const hasTypeFilter = Boolean(query.issueType && query.issueType !== "all");
  const hasAssigneeFilter = Boolean(query.assignee);

  if (view === "my_work") {
    if (!hasAssigneeFilter) {
      conditions.push(eq(schema.issueSheetIssues.assigneeUserId, input.actorUserId));
    }
    if (!hasStatusFilter) {
      conditions.push(inArray(schema.issueSheetIssues.status, [...OPEN_STATUSES]));
    }
  } else if (view === "qa_triage") {
    if (!hasTypeFilter) {
      conditions.push(eq(schema.issueSheetIssues.issueType, "qa_failure"));
    }
    if (!hasAssigneeFilter) {
      conditions.push(isNull(schema.issueSheetIssues.assigneeUserId));
    }
    if (!hasStatusFilter) {
      conditions.push(inArray(schema.issueSheetIssues.status, [...OPEN_STATUSES]));
    }
  } else if (view === "source_context") {
    if (!hasTypeFilter) {
      conditions.push(inArray(schema.issueSheetIssues.issueType, [...SOURCE_CONTEXT_TYPES]));
    }
    if (!hasStatusFilter) {
      conditions.push(inArray(schema.issueSheetIssues.status, [...OPEN_STATUSES]));
    }
  } else if (view === "all_open") {
    if (!hasStatusFilter) {
      conditions.push(inArray(schema.issueSheetIssues.status, [...OPEN_STATUSES]));
    }
  }

  if (hasStatusFilter && query.status && query.status !== "all") {
    conditions.push(eq(schema.issueSheetIssues.status, query.status));
  }
  if (hasTypeFilter && query.issueType && query.issueType !== "all") {
    conditions.push(eq(schema.issueSheetIssues.issueType, query.issueType));
  }
  if (query.priority) {
    conditions.push(sql`${priorityValues.value} #>> '{}' = ${query.priority}`);
  }
  if (query.locale) {
    conditions.push(eq(schema.issueSheetIssues.targetLocale, query.locale));
  }
  if (query.assignee === "me") {
    conditions.push(eq(schema.issueSheetIssues.assigneeUserId, input.actorUserId));
  } else if (query.assignee === "unassigned") {
    conditions.push(isNull(schema.issueSheetIssues.assigneeUserId));
  } else if (query.assignee) {
    conditions.push(eq(schema.issueSheetIssues.assigneeUserId, query.assignee));
  }
  if (query.projectId) {
    conditions.push(eq(schema.issueSheetIssues.projectId, query.projectId));
  }
  if (query.search) {
    const search = `%${query.search}%`;
    const targets = input.searchTargets ?? [
      ilike(schema.issueSheetIssues.title, search),
      ilike(schema.issueSheetIssues.description, search),
      ilike(schema.issueSheetIssues.sourcePath, search),
    ];
    if (targets.length > 0) {
      const searchCondition = or(...targets);
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }
  }

  return conditions;
}

export function buildIssueListOrderBy(query: Pick<IssueListFilterQuery, "sort" | "sortDir">) {
  const sort = query.sort ?? "updated_at";
  const direction = query.sortDir ?? (sort === "priority" || sort === "status" ? "asc" : "desc");
  const ordered = direction === "asc" ? asc : desc;
  const idTieBreaker = asc(schema.issueSheetIssues.id);

  if (sort === "created_at") {
    return [ordered(schema.issueSheetIssues.createdAt), idTieBreaker];
  }
  if (sort === "priority") {
    return [ordered(priorityRankExpression), idTieBreaker];
  }
  if (sort === "status") {
    return [ordered(statusRankExpression), idTieBreaker];
  }
  return [ordered(schema.issueSheetIssues.updatedAt), idTieBreaker];
}

export function issueListNeedsPriorityJoin(query: Pick<IssueListFilterQuery, "priority" | "sort">) {
  return Boolean(query.priority) || query.sort === "priority";
}

/** True only when the priority JOIN is required for WHERE conditions (filtering). */
export function issueListNeedsCountPriorityJoin(query: Pick<IssueListFilterQuery, "priority">) {
  return Boolean(query.priority);
}
