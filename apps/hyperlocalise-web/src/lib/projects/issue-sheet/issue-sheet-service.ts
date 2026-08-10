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
import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  type IssueSheetCreateColumnBody,
  type IssueSheetCreateIssueBody,
  type IssueSheetQuery,
  type IssueSheetSetValueBody,
  type IssueSheetUpdateIssueBody,
} from "@/api/routes/project/issue-sheet.schema";
import type { IssueSheetImportBody } from "@/api/routes/project/issue-sheet.schema";
import { db, schema, type DatabaseClient } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";

import { isErr } from "@/lib/primitives/result/results";

import {
  assertAssignableIssueAssignee,
  listAssignableIssueMembers,
  type AssignableIssueMember,
} from "./issue-sheet-assignee";
import {
  issueSheetCommentSelect,
  mapIssueSheetCommentRow,
  type IssueSheetComment,
} from "./issue-sheet-comment-service";
import {
  runIssueSheetCsvImport,
  type IssueSheetImportResult,
} from "./issue-sheet-csv-import-runner";
import {
  buildIssueListFilterConditions,
  buildIssueListOrderBy,
  issueListNeedsCountPriorityJoin,
  issueListNeedsPriorityJoin,
  priorityColumnJoin,
  priorityColumns,
  priorityValueJoin,
  priorityValues,
} from "./issue-list-query";
import { issueNotificationService } from "./issue-notification-service";
import { issueSubscriptionService } from "./issue-subscription-service";

export const ISSUE_SHEET_ACTIVITY_ASSIGNEE_CHANGED = "assignee_changed" as const;
export const ISSUE_SHEET_ACTIVITY_ISSUE_CREATED = "issue_created" as const;
export const ISSUE_SHEET_ACTIVITY_STATUS_CHANGED = "status_changed" as const;

export type IssueSheetActivityUserSummary = {
  userId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
};

type IssueSheetActivityBase = {
  id: string;
  actor: IssueSheetActivityUserSummary | null;
  createdAt: string;
};

export type IssueSheetActivity =
  | (IssueSheetActivityBase & {
      type: typeof ISSUE_SHEET_ACTIVITY_ASSIGNEE_CHANGED;
      previousAssignee: IssueSheetActivityUserSummary | null;
      nextAssignee: IssueSheetActivityUserSummary | null;
    })
  | (IssueSheetActivityBase & {
      type: typeof ISSUE_SHEET_ACTIVITY_ISSUE_CREATED;
    })
  | (IssueSheetActivityBase & {
      type: typeof ISSUE_SHEET_ACTIVITY_STATUS_CHANGED;
      previousStatus: string;
      nextStatus: string;
    });

export type IssueSheetFeedItem =
  | { kind: "activity"; activity: IssueSheetActivity }
  | {
      kind: "comment_thread";
      root: IssueSheetComment;
      replies: IssueSheetComment[];
    };

export type IssueSheetFeedResult = {
  items: IssueSheetFeedItem[];
  total: number;
  nextCursor: string | null;
};

const FEED_CURSOR_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseFeedCursor(
  cursor: string,
): { createdAt: string; sortRank: number; id: string } | null {
  const parts = cursor.split("|");
  if (parts.length !== 3) {
    return null;
  }
  const [createdAt, sortRankRaw, id] = parts;
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
    return null;
  }
  if (sortRankRaw !== "0" && sortRankRaw !== "1") {
    return null;
  }
  if (!id || !FEED_CURSOR_UUID_PATTERN.test(id)) {
    return null;
  }
  return { createdAt, sortRank: Number(sortRankRaw), id };
}

function encodeFeedCursor(input: { createdAt: string; sortRank: number; id: string }) {
  return `${input.createdAt}|${input.sortRank}|${input.id}`;
}

type ActivityRow = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
  actorUserId: string | null;
};

type FeedPageRow = {
  id: string;
  kind: string;
  created_at: Date | string;
  created_at_cursor: string;
  sort_rank: number | string;
};

function rowsFromExecute<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export type IssueSheetColumn = {
  id: string;
  key: string;
  label: string;
  layer: string;
  type: string;
  config: Record<string, unknown>;
  sortOrder: number;
};

export type IssueSheetIssue = {
  id: string;
  title: string;
  description: string;
  issueType: string;
  status: string;
  targetLocale: string | null;
  sourcePath: string | null;
  segmentId: string | null;
  translationKeyId: string | null;
  linkedCommentId: string | null;
  linkedAgentRunId: string | null;
  linkKind: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  externalRef: string | null;
  reporter: string | null;
  assignee: string | null;
  assigneeUserId: string | null;
  key: string | null;
  sourceText: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  values: Record<string, unknown>;
  isWatching: boolean;
};

export type IssueSheetListResult = {
  issues: IssueSheetIssue[];
  columns: IssueSheetColumn[];
  total: number;
  summary: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    wontFix: number;
  };
};

const starterColumns = [
  {
    key: "priority",
    label: "Priority",
    layer: "custom",
    type: "select",
    sortOrder: 10,
    config: {
      options: [
        { id: "P0", label: "P0", color: "red" },
        { id: "P1", label: "P1", color: "amber" },
        { id: "P2", label: "P2", color: "slate" },
      ],
    },
  },
  {
    key: "owner_note",
    label: "Owner note",
    layer: "custom",
    type: "long_text",
    sortOrder: 20,
    config: {},
  },
  {
    key: "context",
    label: "Context",
    layer: "enrichment",
    type: "enrichment",
    sortOrder: 30,
    config: { agentKind: "context", autoRun: "never" },
  },
] as const;

const assigneeUsers = alias(schema.users, "assignee_users");

type IssueRow = {
  id: string;
  title: string;
  description: string;
  issueType: string;
  status: string;
  targetLocale: string | null;
  sourcePath: string | null;
  segmentId: string | null;
  translationKeyId: string | null;
  linkedCommentId: string | null;
  linkedAgentRunId: string | null;
  linkKind: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  externalRef: string | null;
  assigneeUserId: string | null;
  reporterFirstName: string | null;
  reporterLastName: string | null;
  reporterEmail: string | null;
  assigneeFirstName: string | null;
  assigneeLastName: string | null;
  assigneeEmail: string | null;
  key: string | null;
  sourceText: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
};

function formatUser(row: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}) {
  if (!row.email) {
    return null;
  }
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
  return name || row.email;
}

function mapIssueRow(
  row: IssueRow,
  values: Record<string, unknown>,
  isWatching = false,
): IssueSheetIssue {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    issueType: row.issueType,
    status: row.status,
    targetLocale: row.targetLocale,
    sourcePath: row.sourcePath,
    segmentId: row.segmentId,
    translationKeyId: row.translationKeyId,
    linkedCommentId: row.linkedCommentId,
    linkedAgentRunId: row.linkedAgentRunId,
    linkKind: row.linkKind,
    linkLabel: row.linkLabel,
    linkUrl: row.linkUrl,
    externalRef: row.externalRef,
    assigneeUserId: row.assigneeUserId,
    reporter: formatUser({
      firstName: row.reporterFirstName,
      lastName: row.reporterLastName,
      email: row.reporterEmail,
    }),
    assignee: formatUser({
      firstName: row.assigneeFirstName,
      lastName: row.assigneeLastName,
      email: row.assigneeEmail,
    }),
    key: row.key,
    sourceText: row.sourceText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    values,
    isWatching,
  };
}

export class IssueSheetService {
  constructor(private readonly database: typeof db = db) {}

  async ensureStarterColumns(input: {
    organizationId: string;
    projectId: string;
    actorUserId?: string;
  }) {
    for (const column of starterColumns) {
      await this.database
        .insert(schema.issueSheetColumns)
        .values({
          organizationId: input.organizationId,
          projectId: input.projectId,
          key: column.key,
          label: column.label,
          layer: column.layer,
          type: column.type,
          config: JSON.parse(JSON.stringify(column.config)),
          sortOrder: column.sortOrder,
          createdByUserId: input.actorUserId ?? null,
        })
        .onConflictDoNothing();
    }
  }

  async listColumns(input: {
    organizationId: string;
    projectId: string;
    actorUserId?: string;
  }): Promise<IssueSheetColumn[]> {
    await this.ensureStarterColumns(input);
    const rows = await this.database
      .select({
        id: schema.issueSheetColumns.id,
        key: schema.issueSheetColumns.key,
        label: schema.issueSheetColumns.label,
        layer: schema.issueSheetColumns.layer,
        type: schema.issueSheetColumns.type,
        config: schema.issueSheetColumns.config,
        sortOrder: schema.issueSheetColumns.sortOrder,
      })
      .from(schema.issueSheetColumns)
      .where(
        and(
          eq(schema.issueSheetColumns.organizationId, input.organizationId),
          eq(schema.issueSheetColumns.projectId, input.projectId),
        ),
      )
      .orderBy(asc(schema.issueSheetColumns.sortOrder), asc(schema.issueSheetColumns.createdAt));

    return rows.map((row) => ({
      ...row,
      config: row.config as Record<string, unknown>,
    }));
  }

  async createColumn(input: {
    organizationId: string;
    projectId: string;
    actorUserId?: string;
    body: IssueSheetCreateColumnBody;
  }): Promise<IssueSheetColumn> {
    await this.ensureStarterColumns(input);
    const [maxRow] = await this.database
      .select({
        maxSortOrder: sql<number>`coalesce(max(${schema.issueSheetColumns.sortOrder}), 0)`,
      })
      .from(schema.issueSheetColumns)
      .where(
        and(
          eq(schema.issueSheetColumns.organizationId, input.organizationId),
          eq(schema.issueSheetColumns.projectId, input.projectId),
        ),
      );

    const [column] = await this.database
      .insert(schema.issueSheetColumns)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        key: input.body.key,
        label: input.body.label,
        layer: "custom",
        type: input.body.type,
        config: input.body.config ?? {},
        sortOrder: (maxRow?.maxSortOrder ?? 0) + 10,
        createdByUserId: input.actorUserId ?? null,
      })
      .returning({
        id: schema.issueSheetColumns.id,
        key: schema.issueSheetColumns.key,
        label: schema.issueSheetColumns.label,
        layer: schema.issueSheetColumns.layer,
        type: schema.issueSheetColumns.type,
        config: schema.issueSheetColumns.config,
        sortOrder: schema.issueSheetColumns.sortOrder,
      });

    if (!column) {
      throw new Error("issue_sheet_column_create_failed");
    }

    return {
      ...column,
      config: column.config as Record<string, unknown>,
    };
  }

  async listIssues(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
    query: IssueSheetQuery;
    issueId?: string;
  }): Promise<IssueSheetListResult> {
    const columns = await this.listColumns(input);
    const conditions = this.buildIssueConditions(input);
    const [rows, totalRow, summary] = await Promise.all([
      this.fetchIssueRows(conditions, {
        limit: input.query.limit,
        offset: input.query.offset,
        query: input.query,
      }),
      this.countIssueRows(conditions, input.query),
      this.loadSummary(input),
    ]);
    const issueIds = rows.map((row) => row.id);
    const valuesByIssueId = await this.loadValuesByIssueId({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueIds,
      columns,
    });

    return {
      columns,
      total: totalRow,
      summary,
      issues: rows.map((row) => mapIssueRow(row, valuesByIssueId.get(row.id) ?? {})),
    };
  }

  async listAssignableMembers(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
  }): Promise<AssignableIssueMember[]> {
    return listAssignableIssueMembers({
      organizationId: input.organizationId,
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      database: this.database,
    });
  }

  async listFeed(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    role: OrganizationMembershipRole;
    limit?: number;
    cursor?: string;
  }): Promise<IssueSheetFeedResult> {
    const [issue] = await this.database
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, input.organizationId),
          eq(schema.issueSheetIssues.projectId, input.projectId),
          eq(schema.issueSheetIssues.id, input.issueId),
        ),
      )
      .limit(1);

    if (!issue) {
      throw new Error("issue_sheet_issue_not_found");
    }

    const limit = input.limit ?? 100;
    const parsedCursor = input.cursor ? parseFeedCursor(input.cursor) : null;
    if (input.cursor && !parsedCursor) {
      throw new Error("invalid_issue_sheet_feed_cursor");
    }

    const cursorFilter = parsedCursor
      ? sql`and (feed.created_at, feed.sort_rank, feed.id) > (${parsedCursor.createdAt}::timestamptz, ${parsedCursor.sortRank}, ${parsedCursor.id}::uuid)`
      : sql``;

    const [totalRow, feedResult] = await Promise.all([
      this.database.execute(sql`
        select (
          (
            select count(*)::int
            from ${schema.issueSheetActivities}
            where ${schema.issueSheetActivities.organizationId} = ${input.organizationId}
              and ${schema.issueSheetActivities.projectId} = ${input.projectId}
              and ${schema.issueSheetActivities.issueId} = ${input.issueId}
          )
          +
          (
            select count(*)::int
            from ${schema.issueSheetComments}
            where ${schema.issueSheetComments.organizationId} = ${input.organizationId}
              and ${schema.issueSheetComments.projectId} = ${input.projectId}
              and ${schema.issueSheetComments.issueId} = ${input.issueId}
              and ${schema.issueSheetComments.depth} = 0
          )
        ) as total
      `),
      this.database.execute(sql`
        select feed.id, feed.kind, feed.created_at, feed.created_at_cursor, feed.sort_rank
        from (
          select
            ${schema.issueSheetActivities.id} as id,
            'activity'::text as kind,
            ${schema.issueSheetActivities.createdAt} as created_at,
            ${schema.issueSheetActivities.createdAt}::text as created_at_cursor,
            case
              when ${schema.issueSheetActivities.type} = ${ISSUE_SHEET_ACTIVITY_ISSUE_CREATED}
              then 0
              else 1
            end as sort_rank
          from ${schema.issueSheetActivities}
          where ${schema.issueSheetActivities.organizationId} = ${input.organizationId}
            and ${schema.issueSheetActivities.projectId} = ${input.projectId}
            and ${schema.issueSheetActivities.issueId} = ${input.issueId}
          union all
          select
            ${schema.issueSheetComments.id} as id,
            'comment_thread'::text as kind,
            ${schema.issueSheetComments.createdAt} as created_at,
            ${schema.issueSheetComments.createdAt}::text as created_at_cursor,
            1 as sort_rank
          from ${schema.issueSheetComments}
          where ${schema.issueSheetComments.organizationId} = ${input.organizationId}
            and ${schema.issueSheetComments.projectId} = ${input.projectId}
            and ${schema.issueSheetComments.issueId} = ${input.issueId}
            and ${schema.issueSheetComments.depth} = 0
        ) as feed
        where true
        ${cursorFilter}
        order by feed.created_at asc, feed.sort_rank asc, feed.id asc
        limit ${limit + 1}
      `),
    ]);

    const total = Number(rowsFromExecute<{ total?: number }>(totalRow)[0]?.total ?? 0);
    const feedRows = rowsFromExecute<FeedPageRow>(feedResult);
    const hasMore = feedRows.length > limit;
    const pageRows = hasMore ? feedRows.slice(0, limit) : feedRows;

    const activityIds = pageRows
      .filter((row) => row.kind === "activity")
      .map((row) => String(row.id));
    const rootCommentIds = pageRows
      .filter((row) => row.kind === "comment_thread")
      .map((row) => String(row.id));

    const activityRows =
      activityIds.length === 0
        ? []
        : await this.database
            .select({
              id: schema.issueSheetActivities.id,
              type: schema.issueSheetActivities.type,
              payload: schema.issueSheetActivities.payload,
              createdAt: schema.issueSheetActivities.createdAt,
              actorUserId: schema.issueSheetActivities.actorUserId,
            })
            .from(schema.issueSheetActivities)
            .where(inArray(schema.issueSheetActivities.id, activityIds));

    const activities = await this.hydrateActivityRows(activityRows);
    const activitiesById = new Map(activities.map((activity) => [activity.id, activity] as const));

    const actor = { userId: input.actorUserId, role: input.role };
    const rootCommentRows =
      rootCommentIds.length === 0
        ? []
        : await this.database
            .select(issueSheetCommentSelect)
            .from(schema.issueSheetComments)
            .leftJoin(schema.users, eq(schema.issueSheetComments.authorUserId, schema.users.id))
            .where(inArray(schema.issueSheetComments.id, rootCommentIds));

    const roots = rootCommentRows.map((row) => mapIssueSheetCommentRow(row, actor));
    const rootsById = new Map(roots.map((root) => [root.id, root] as const));

    const replyRows =
      roots.length === 0
        ? []
        : await this.database
            .select(issueSheetCommentSelect)
            .from(schema.issueSheetComments)
            .leftJoin(schema.users, eq(schema.issueSheetComments.authorUserId, schema.users.id))
            .where(
              and(
                eq(schema.issueSheetComments.organizationId, input.organizationId),
                eq(schema.issueSheetComments.projectId, input.projectId),
                eq(schema.issueSheetComments.issueId, input.issueId),
                sql`${schema.issueSheetComments.depth} > 0`,
                or(
                  ...roots.map(
                    (root) => sql`${schema.issueSheetComments.path} like ${`${root.path}.%`}`,
                  ),
                ),
              ),
            )
            .orderBy(asc(schema.issueSheetComments.createdAt), asc(schema.issueSheetComments.id));

    const repliesByRootId = new Map<string, IssueSheetComment[]>();
    for (const row of replyRows) {
      const reply = mapIssueSheetCommentRow(row, actor);
      const root = roots.find((candidate) => reply.path.startsWith(`${candidate.path}.`));
      if (!root) {
        continue;
      }
      const existing = repliesByRootId.get(root.id);
      if (existing) {
        existing.push(reply);
      } else {
        repliesByRootId.set(root.id, [reply]);
      }
    }

    const items: IssueSheetFeedItem[] = [];
    for (const row of pageRows) {
      const id = String(row.id);
      if (row.kind === "activity") {
        const activity = activitiesById.get(id);
        if (activity) {
          items.push({ kind: "activity", activity });
        }
        continue;
      }

      const root = rootsById.get(id);
      if (root) {
        items.push({
          kind: "comment_thread",
          root,
          replies: repliesByRootId.get(root.id) ?? [],
        });
      }
    }

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1]!;
      nextCursor = encodeFeedCursor({
        createdAt: String(last.created_at_cursor),
        sortRank: Number(last.sort_rank),
        id: String(last.id),
      });
    }

    return { items, total, nextCursor };
  }

  private async hydrateActivityRows(rows: ActivityRow[]): Promise<IssueSheetActivity[]> {
    const userIds = new Set<string>();
    for (const row of rows) {
      if (row.actorUserId) {
        userIds.add(row.actorUserId);
      }
      if (
        row.type === ISSUE_SHEET_ACTIVITY_ASSIGNEE_CHANGED &&
        row.payload &&
        typeof row.payload === "object" &&
        "previousAssigneeUserId" in row.payload
      ) {
        const payload = row.payload as {
          previousAssigneeUserId?: unknown;
          nextAssigneeUserId?: unknown;
        };
        if (typeof payload.previousAssigneeUserId === "string") {
          userIds.add(payload.previousAssigneeUserId);
        }
        if (typeof payload.nextAssigneeUserId === "string") {
          userIds.add(payload.nextAssigneeUserId);
        }
      }
    }

    const userRows =
      userIds.size === 0
        ? []
        : await this.database
            .select({
              id: schema.users.id,
              firstName: schema.users.firstName,
              lastName: schema.users.lastName,
              email: schema.users.email,
              avatarUrl: schema.users.avatarUrl,
            })
            .from(schema.users)
            .where(inArray(schema.users.id, [...userIds]));

    const usersById = new Map(userRows.map((row) => [row.id, row] as const));

    const activities: IssueSheetActivity[] = [];
    for (const row of rows) {
      const actorRow = row.actorUserId ? usersById.get(row.actorUserId) : undefined;
      const actor = this.mapActivityUser({
        userId: row.actorUserId,
        firstName: actorRow?.firstName ?? null,
        lastName: actorRow?.lastName ?? null,
        email: actorRow?.email ?? null,
        avatarUrl: actorRow?.avatarUrl ?? null,
      });
      const createdAt = row.createdAt.toISOString();
      const payload =
        row.payload && typeof row.payload === "object"
          ? (row.payload as Record<string, unknown>)
          : {};

      if (row.type === ISSUE_SHEET_ACTIVITY_ISSUE_CREATED) {
        activities.push({
          id: row.id,
          type: ISSUE_SHEET_ACTIVITY_ISSUE_CREATED,
          actor,
          createdAt,
        });
        continue;
      }

      if (row.type === ISSUE_SHEET_ACTIVITY_STATUS_CHANGED) {
        const previousStatus =
          "previousStatus" in payload && typeof payload.previousStatus === "string"
            ? payload.previousStatus
            : null;
        const nextStatus =
          "nextStatus" in payload && typeof payload.nextStatus === "string"
            ? payload.nextStatus
            : null;
        if (!previousStatus || !nextStatus) {
          continue;
        }
        activities.push({
          id: row.id,
          type: ISSUE_SHEET_ACTIVITY_STATUS_CHANGED,
          actor,
          previousStatus,
          nextStatus,
          createdAt,
        });
        continue;
      }

      if (row.type !== ISSUE_SHEET_ACTIVITY_ASSIGNEE_CHANGED) {
        continue;
      }

      const previousId =
        "previousAssigneeUserId" in payload && typeof payload.previousAssigneeUserId === "string"
          ? payload.previousAssigneeUserId
          : null;
      const nextId =
        "nextAssigneeUserId" in payload && typeof payload.nextAssigneeUserId === "string"
          ? payload.nextAssigneeUserId
          : null;
      const previous = previousId ? usersById.get(previousId) : undefined;
      const next = nextId ? usersById.get(nextId) : undefined;

      activities.push({
        id: row.id,
        type: ISSUE_SHEET_ACTIVITY_ASSIGNEE_CHANGED,
        actor,
        previousAssignee: this.mapActivityUser({
          userId: previousId,
          firstName: previous?.firstName ?? null,
          lastName: previous?.lastName ?? null,
          email: previous?.email ?? null,
          avatarUrl: previous?.avatarUrl ?? null,
        }),
        nextAssignee: this.mapActivityUser({
          userId: nextId,
          firstName: next?.firstName ?? null,
          lastName: next?.lastName ?? null,
          email: next?.email ?? null,
          avatarUrl: next?.avatarUrl ?? null,
        }),
        createdAt,
      });
    }

    return activities;
  }

  async createIssue(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
    body: IssueSheetCreateIssueBody;
  }): Promise<IssueSheetIssue> {
    await this.ensureStarterColumns(input);
    if (input.body.translationKeyId) {
      await this.assertTranslationKeyInProject({
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyId: input.body.translationKeyId,
      });
    }
    const existing = await this.findExistingLinkedIssue(input);
    if (existing) {
      return existing;
    }

    const assigneeUserId = input.body.assigneeUserId ?? null;
    if (assigneeUserId) {
      const assignable = await assertAssignableIssueAssignee({
        organizationId: input.organizationId,
        projectId: input.projectId,
        assigneeUserId,
        database: this.database,
      });
      if (isErr(assignable)) {
        throw new Error(assignable.error.code);
      }
    }

    const issueId = await this.database.transaction(async (tx) => {
      const [issue] = await tx
        .insert(schema.issueSheetIssues)
        .values({
          organizationId: input.organizationId,
          projectId: input.projectId,
          title: input.body.title,
          description: input.body.description ?? "",
          issueType: input.body.issueType ?? "general_question",
          status: input.body.status ?? "open",
          targetLocale: input.body.targetLocale ?? null,
          sourcePath: input.body.sourcePath ?? null,
          segmentId: input.body.segmentId ?? null,
          translationKeyId: input.body.translationKeyId ?? null,
          linkedCommentId: input.body.linkedCommentId ?? null,
          linkedAgentRunId: input.body.linkedAgentRunId ?? null,
          linkKind: input.body.linkKind ?? null,
          linkLabel: input.body.linkLabel ?? null,
          linkUrl: input.body.linkUrl ?? null,
          externalRef: input.body.externalRef ?? null,
          reporterUserId: input.actorUserId,
          assigneeUserId,
          resolvedAt:
            input.body.status === "resolved" || input.body.status === "wont_fix"
              ? new Date()
              : null,
        })
        .onConflictDoNothing()
        .returning({ id: schema.issueSheetIssues.id });

      if (!issue) {
        return null;
      }

      const activityCreatedAt = new Date();

      await this.insertIssueCreatedActivity({
        database: tx,
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: issue.id,
        actorUserId: input.actorUserId,
        createdAt: activityCreatedAt,
      });

      if (assigneeUserId) {
        await this.insertAssigneeChangedActivity({
          database: tx,
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: issue.id,
          actorUserId: input.actorUserId,
          previousAssigneeUserId: null,
          nextAssigneeUserId: assigneeUserId,
          createdAt: new Date(activityCreatedAt.getTime() + 1),
        });
      }

      await issueSubscriptionService.subscribeMany({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: issue.id,
        userIds: [input.actorUserId, ...(assigneeUserId ? [assigneeUserId] : [])],
        database: tx,
      });

      return issue.id;
    });

    if (!issueId) {
      const conflicted = await this.findExistingLinkedIssue(input);
      if (conflicted) {
        return conflicted;
      }
      throw new Error("issue_sheet_issue_create_failed");
    }

    if (input.body.priority) {
      await this.setValue({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId,
        body: { columnKey: "priority", value: input.body.priority },
      });
    }

    const customValues = input.body.values;
    if (customValues) {
      for (const [columnKey, value] of Object.entries(customValues)) {
        if (columnKey === "priority") {
          continue;
        }
        await this.setValue({
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId,
          body: { columnKey, value },
        });
      }
    }

    if (assigneeUserId) {
      await issueNotificationService.safeFanOut("assigned_on_create", () =>
        issueNotificationService.notifyAssigned({
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId,
          actorUserId: input.actorUserId,
          assigneeUserId,
        }),
      );
    }

    const created = await this.getIssueById({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId,
      actorUserId: input.actorUserId,
    });
    if (!created) {
      throw new Error("issue_sheet_issue_load_failed");
    }
    return created;
  }

  async updateIssue(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    body: IssueSheetUpdateIssueBody;
  }): Promise<IssueSheetIssue | null> {
    const nextStatus = input.body.status;
    const resolvedAt =
      nextStatus === "resolved" || nextStatus === "wont_fix"
        ? new Date()
        : nextStatus === "open" || nextStatus === "in_progress"
          ? null
          : undefined;

    const assigneeChanging = Object.hasOwn(input.body, "assigneeUserId");
    const requestedAssigneeUserId = assigneeChanging ? (input.body.assigneeUserId ?? null) : null;

    if (assigneeChanging && requestedAssigneeUserId) {
      const assignable = await assertAssignableIssueAssignee({
        organizationId: input.organizationId,
        projectId: input.projectId,
        assigneeUserId: requestedAssigneeUserId,
        database: this.database,
      });
      if (isErr(assignable)) {
        throw new Error(assignable.error.code);
      }
    }

    const translationKeyChanging = Object.hasOwn(input.body, "translationKeyId");
    if (translationKeyChanging && input.body.translationKeyId) {
      await this.assertTranslationKeyInProject({
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyId: input.body.translationKeyId,
      });
    }

    const found = await this.database.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: schema.issueSheetIssues.id,
          status: schema.issueSheetIssues.status,
          assigneeUserId: schema.issueSheetIssues.assigneeUserId,
        })
        .from(schema.issueSheetIssues)
        .where(
          and(
            eq(schema.issueSheetIssues.organizationId, input.organizationId),
            eq(schema.issueSheetIssues.projectId, input.projectId),
            eq(schema.issueSheetIssues.id, input.issueId),
          ),
        )
        .limit(1)
        .for("update");

      if (!current) {
        return null;
      }

      const nextAssigneeUserId = assigneeChanging
        ? requestedAssigneeUserId
        : current.assigneeUserId;
      const statusChanging =
        Object.hasOwn(input.body, "status") &&
        input.body.status != null &&
        input.body.status !== current.status;
      const nextStatusValue = statusChanging ? input.body.status! : current.status;
      const assigneeActuallyChanged =
        assigneeChanging && current.assigneeUserId !== nextAssigneeUserId;

      await tx
        .update(schema.issueSheetIssues)
        .set({
          title: input.body.title,
          description: input.body.description,
          issueType: input.body.issueType,
          status: input.body.status,
          targetLocale: input.body.targetLocale,
          sourcePath: input.body.sourcePath,
          segmentId: input.body.segmentId,
          ...(translationKeyChanging
            ? { translationKeyId: input.body.translationKeyId ?? null }
            : {}),
          linkKind: input.body.linkKind,
          linkLabel: input.body.linkLabel,
          linkUrl: input.body.linkUrl,
          ...(assigneeChanging ? { assigneeUserId: nextAssigneeUserId } : {}),
          ...(resolvedAt !== undefined ? { resolvedAt } : {}),
        })
        .where(
          and(
            eq(schema.issueSheetIssues.organizationId, input.organizationId),
            eq(schema.issueSheetIssues.projectId, input.projectId),
            eq(schema.issueSheetIssues.id, input.issueId),
          ),
        );

      if (statusChanging) {
        await this.insertStatusChangedActivity({
          database: tx,
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: input.issueId,
          actorUserId: input.actorUserId,
          previousStatus: current.status,
          nextStatus: nextStatusValue,
        });
      }

      if (assigneeActuallyChanged) {
        await this.insertAssigneeChangedActivity({
          database: tx,
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: input.issueId,
          actorUserId: input.actorUserId,
          previousAssigneeUserId: current.assigneeUserId,
          nextAssigneeUserId,
        });
      }

      return {
        statusChanging,
        previousStatus: current.status,
        nextStatus: nextStatusValue,
        assigneeActuallyChanged,
        previousAssigneeUserId: current.assigneeUserId,
        nextAssigneeUserId,
      };
    });

    if (!found) {
      return null;
    }

    if (found.assigneeActuallyChanged && found.nextAssigneeUserId) {
      await issueSubscriptionService.subscribe({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        userId: found.nextAssigneeUserId,
      });
    }

    if (found.statusChanging) {
      await issueNotificationService.safeFanOut("status_changed", () =>
        issueNotificationService.notifyStatusChanged({
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: input.issueId,
          actorUserId: input.actorUserId,
          previousStatus: found.previousStatus,
          nextStatus: found.nextStatus,
        }),
      );
    }

    if (found.assigneeActuallyChanged) {
      await issueNotificationService.safeFanOut("assignee_changed", () =>
        issueNotificationService.notifyAssigneeChanged({
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: input.issueId,
          actorUserId: input.actorUserId,
          previousAssigneeUserId: found.previousAssigneeUserId,
          nextAssigneeUserId: found.nextAssigneeUserId,
        }),
      );
    }

    return this.getIssueById(input);
  }

  async importFromCsv(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
    body: IssueSheetImportBody;
  }): Promise<IssueSheetImportResult> {
    return runIssueSheetCsvImport(this, input);
  }

  async setValue(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    body: IssueSheetSetValueBody;
  }) {
    const [issue] = await this.database
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, input.organizationId),
          eq(schema.issueSheetIssues.projectId, input.projectId),
          eq(schema.issueSheetIssues.id, input.issueId),
        ),
      )
      .limit(1);

    if (!issue) {
      throw new Error("issue_sheet_issue_not_found");
    }

    const [column] = await this.database
      .select({
        id: schema.issueSheetColumns.id,
        key: schema.issueSheetColumns.key,
        type: schema.issueSheetColumns.type,
        config: schema.issueSheetColumns.config,
      })
      .from(schema.issueSheetColumns)
      .where(
        and(
          eq(schema.issueSheetColumns.organizationId, input.organizationId),
          eq(schema.issueSheetColumns.projectId, input.projectId),
          eq(schema.issueSheetColumns.key, input.body.columnKey),
        ),
      )
      .limit(1);

    if (!column) {
      return null;
    }

    const value = this.normalizeValue(column, input.body.value);
    await this.database
      .insert(schema.issueSheetRowValues)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        columnId: column.id,
        value,
        computedAt: column.type === "enrichment" ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [schema.issueSheetRowValues.issueId, schema.issueSheetRowValues.columnId],
        set: {
          value,
          computedAt: column.type === "enrichment" ? new Date() : null,
          updatedAt: new Date(),
        },
      });

    return {
      issueId: input.issueId,
      columnKey: column.key,
      value,
    };
  }

  private mapActivityUser(input: {
    userId: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    avatarUrl: string | null;
  }): IssueSheetActivityUserSummary | null {
    if (!input.userId) {
      return null;
    }
    const displayName =
      formatUser({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
      }) ?? input.userId;
    return {
      userId: input.userId,
      displayName,
      email: input.email,
      avatarUrl: input.avatarUrl,
    };
  }

  private async insertAssigneeChangedActivity(input: {
    database: DatabaseClient;
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    previousAssigneeUserId: string | null;
    nextAssigneeUserId: string | null;
    createdAt?: Date;
  }) {
    await input.database.insert(schema.issueSheetActivities).values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      actorUserId: input.actorUserId,
      type: ISSUE_SHEET_ACTIVITY_ASSIGNEE_CHANGED,
      payload: {
        previousAssigneeUserId: input.previousAssigneeUserId,
        nextAssigneeUserId: input.nextAssigneeUserId,
      },
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    });
  }

  private async insertIssueCreatedActivity(input: {
    database: DatabaseClient;
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    createdAt?: Date;
  }) {
    await input.database.insert(schema.issueSheetActivities).values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      actorUserId: input.actorUserId,
      type: ISSUE_SHEET_ACTIVITY_ISSUE_CREATED,
      payload: {},
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    });
  }

  private async insertStatusChangedActivity(input: {
    database: DatabaseClient;
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
    previousStatus: string;
    nextStatus: string;
  }) {
    await input.database.insert(schema.issueSheetActivities).values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      actorUserId: input.actorUserId,
      type: ISSUE_SHEET_ACTIVITY_STATUS_CHANGED,
      payload: {
        previousStatus: input.previousStatus,
        nextStatus: input.nextStatus,
      },
    });
  }

  private async assertTranslationKeyInProject(input: {
    organizationId: string;
    projectId: string;
    translationKeyId: string;
  }) {
    const [key] = await this.database
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.id, input.translationKeyId),
          eq(schema.projectTranslationKeys.organizationId, input.organizationId),
          eq(schema.projectTranslationKeys.projectId, input.projectId),
        ),
      )
      .limit(1);

    if (!key) {
      throw new Error("translation_key_not_found");
    }
  }

  private async findExistingLinkedIssue(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
    body: IssueSheetCreateIssueBody;
  }) {
    const baseConditions: SQL[] = [
      eq(schema.issueSheetIssues.organizationId, input.organizationId),
      eq(schema.issueSheetIssues.projectId, input.projectId),
    ];

    if (input.body.externalRef) {
      const existingByExternalRef = await this.findFirstIssueByConditions(input, [
        ...baseConditions,
        eq(schema.issueSheetIssues.externalRef, input.body.externalRef),
      ]);
      if (existingByExternalRef) {
        return existingByExternalRef;
      }
    }

    const linkConditions: SQL[] = [];
    if (input.body.linkedCommentId) {
      linkConditions.push(eq(schema.issueSheetIssues.linkedCommentId, input.body.linkedCommentId));
    }
    // String-linked / CAT creates may have many open issues per segment.
    // Keep segment+locale dedupe for other link kinds without an explicit translation key.
    if (
      !input.body.translationKeyId &&
      input.body.linkKind !== "cat_segment" &&
      input.body.segmentId &&
      input.body.targetLocale
    ) {
      linkConditions.push(
        and(
          eq(schema.issueSheetIssues.segmentId, input.body.segmentId),
          eq(schema.issueSheetIssues.targetLocale, input.body.targetLocale),
        )!,
      );
    }

    if (linkConditions.length === 0) {
      return null;
    }

    return this.findFirstIssueByConditions(input, [
      ...baseConditions,
      inArray(schema.issueSheetIssues.status, ["open", "in_progress"]),
      or(...linkConditions)!,
    ]);
  }

  private async findFirstIssueByConditions(
    input: {
      organizationId: string;
      projectId: string;
      actorUserId: string;
    },
    conditions: SQL[],
  ) {
    const [existing] = await this.database
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(and(...conditions))
      .orderBy(desc(schema.issueSheetIssues.createdAt))
      .limit(1);

    if (!existing) {
      return null;
    }

    return this.getIssueById({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: existing.id,
      actorUserId: input.actorUserId,
    });
  }

  async getIssue(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
  }): Promise<IssueSheetIssue | null> {
    return this.getIssueById(input);
  }

  async watchIssue(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
  }) {
    const issue = await this.getIssueById(input);
    if (!issue) {
      return null;
    }

    await issueSubscriptionService.subscribe({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      userId: input.actorUserId,
    });

    return issueSubscriptionService.getSubscription({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      userId: input.actorUserId,
    });
  }

  async unwatchIssue(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
  }): Promise<boolean> {
    const issue = await this.getIssueById(input);
    if (!issue) {
      return false;
    }

    await issueSubscriptionService.unsubscribe({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      userId: input.actorUserId,
    });

    return true;
  }

  async listIssueSubscribers(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
  }) {
    const issue = await this.getIssueById(input);
    if (!issue) {
      return null;
    }

    return issueSubscriptionService.listSubscribers(input);
  }

  private async getIssueById(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
  }) {
    const columns = await this.listColumns(input);
    const rows = await this.fetchIssueRows(
      [
        eq(schema.issueSheetIssues.organizationId, input.organizationId),
        eq(schema.issueSheetIssues.projectId, input.projectId),
        eq(schema.issueSheetIssues.id, input.issueId),
      ],
      {
        limit: 1,
        query: {
          sort: "updated_at",
          sortDir: "desc",
          limit: 1,
          offset: 0,
        },
      },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }

    const valuesByIssueId = await this.loadValuesByIssueId({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueIds: [row.id],
      columns,
    });

    const isWatching = await issueSubscriptionService.isSubscribed({
      issueId: row.id,
      userId: input.actorUserId,
    });

    return mapIssueRow(row, valuesByIssueId.get(row.id) ?? {}, isWatching);
  }

  private async countIssueRows(conditions: SQL[], query: IssueSheetQuery): Promise<number> {
    let countQuery = this.database
      .select({ value: count() })
      .from(schema.issueSheetIssues)
      .$dynamic();

    if (issueListNeedsCountPriorityJoin(query)) {
      countQuery = countQuery
        .leftJoin(priorityColumns, priorityColumnJoin)
        .leftJoin(priorityValues, priorityValueJoin);
    }

    const totalRow = await countQuery.where(and(...conditions));
    return totalRow[0]?.value ?? 0;
  }

  private fetchIssueRows(
    conditions: SQL[],
    pagination: { limit: number; offset?: number; query: IssueSheetQuery },
  ): Promise<IssueRow[]> {
    const orderBy = buildIssueListOrderBy(pagination.query);
    let listQuery = this.database
      .select({
        id: schema.issueSheetIssues.id,
        title: schema.issueSheetIssues.title,
        description: schema.issueSheetIssues.description,
        issueType: schema.issueSheetIssues.issueType,
        status: schema.issueSheetIssues.status,
        targetLocale: schema.issueSheetIssues.targetLocale,
        sourcePath: schema.issueSheetIssues.sourcePath,
        segmentId: schema.issueSheetIssues.segmentId,
        translationKeyId: schema.issueSheetIssues.translationKeyId,
        linkedCommentId: schema.issueSheetIssues.linkedCommentId,
        linkedAgentRunId: schema.issueSheetIssues.linkedAgentRunId,
        linkKind: schema.issueSheetIssues.linkKind,
        linkLabel: schema.issueSheetIssues.linkLabel,
        linkUrl: schema.issueSheetIssues.linkUrl,
        externalRef: schema.issueSheetIssues.externalRef,
        assigneeUserId: schema.issueSheetIssues.assigneeUserId,
        reporterFirstName: schema.users.firstName,
        reporterLastName: schema.users.lastName,
        reporterEmail: schema.users.email,
        assigneeFirstName: assigneeUsers.firstName,
        assigneeLastName: assigneeUsers.lastName,
        assigneeEmail: assigneeUsers.email,
        key: schema.projectTranslationKeys.key,
        sourceText: schema.projectTranslationKeys.sourceText,
        createdAt: schema.issueSheetIssues.createdAt,
        updatedAt: schema.issueSheetIssues.updatedAt,
        resolvedAt: schema.issueSheetIssues.resolvedAt,
      })
      .from(schema.issueSheetIssues)
      .leftJoin(schema.users, eq(schema.issueSheetIssues.reporterUserId, schema.users.id))
      .leftJoin(assigneeUsers, eq(schema.issueSheetIssues.assigneeUserId, assigneeUsers.id))
      .leftJoin(
        schema.projectTranslationKeys,
        eq(schema.issueSheetIssues.translationKeyId, schema.projectTranslationKeys.id),
      )
      .$dynamic();

    if (issueListNeedsPriorityJoin(pagination.query)) {
      listQuery = listQuery
        .leftJoin(priorityColumns, priorityColumnJoin)
        .leftJoin(priorityValues, priorityValueJoin);
    }

    return listQuery
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(pagination.limit)
      .offset(pagination.offset ?? 0);
  }

  private buildIssueConditions(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
    query: IssueSheetQuery;
    issueId?: string;
  }) {
    const conditions: SQL[] = [
      eq(schema.issueSheetIssues.organizationId, input.organizationId),
      eq(schema.issueSheetIssues.projectId, input.projectId),
      ...buildIssueListFilterConditions({
        actorUserId: input.actorUserId,
        query: input.query,
      }),
    ];
    if ("issueId" in input && input.issueId) {
      conditions.push(eq(schema.issueSheetIssues.id, input.issueId));
    }

    return conditions;
  }

  private async loadValuesByIssueId(input: {
    organizationId: string;
    projectId: string;
    issueIds: string[];
    columns: IssueSheetColumn[];
  }) {
    const valuesByIssueId = new Map<string, Record<string, unknown>>();
    if (input.issueIds.length === 0) {
      return valuesByIssueId;
    }

    const rows = await this.database
      .select({
        issueId: schema.issueSheetRowValues.issueId,
        columnId: schema.issueSheetRowValues.columnId,
        value: schema.issueSheetRowValues.value,
      })
      .from(schema.issueSheetRowValues)
      .where(
        and(
          eq(schema.issueSheetRowValues.organizationId, input.organizationId),
          eq(schema.issueSheetRowValues.projectId, input.projectId),
          inArray(schema.issueSheetRowValues.issueId, input.issueIds),
        ),
      );

    const columnKeyById = new Map(input.columns.map((column) => [column.id, column.key]));
    for (const row of rows) {
      const columnKey = columnKeyById.get(row.columnId);
      if (!columnKey) {
        continue;
      }
      const values = valuesByIssueId.get(row.issueId) ?? {};
      values[columnKey] = row.value;
      valuesByIssueId.set(row.issueId, values);
    }

    return valuesByIssueId;
  }

  private async loadSummary(input: { organizationId: string; projectId: string }) {
    const rows = await this.database
      .select({
        status: schema.issueSheetIssues.status,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.issueSheetIssues)
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, input.organizationId),
          eq(schema.issueSheetIssues.projectId, input.projectId),
        ),
      )
      .groupBy(schema.issueSheetIssues.status);

    const counts = new Map(rows.map((row) => [row.status, row.count]));
    return {
      total: rows.reduce((sum, row) => sum + row.count, 0),
      open: counts.get("open") ?? 0,
      inProgress: counts.get("in_progress") ?? 0,
      resolved: counts.get("resolved") ?? 0,
      wontFix: counts.get("wont_fix") ?? 0,
    };
  }

  private normalizeValue(
    column: { type: string; config: Record<string, unknown> },
    value: unknown,
  ): unknown {
    if (value == null || value === "") {
      return null;
    }

    if (column.type === "select") {
      const options = Array.isArray(column.config.options) ? column.config.options : [];
      const allowed = new Set(
        options
          .map((option) =>
            typeof option === "object" && option != null && "id" in option
              ? primitiveToString(option.id)
              : null,
          )
          .filter((option): option is string => option != null),
      );
      const stringValue = primitiveToString(value);
      if (allowed.size > 0 && !allowed.has(stringValue)) {
        throw new Error("invalid_issue_sheet_select_value");
      }
      return stringValue;
    }

    if (column.type === "text" || column.type === "long_text" || column.type === "enrichment") {
      return primitiveToString(value).slice(0, column.type === "long_text" ? 20_000 : 4_000);
    }

    if (column.type === "user") {
      return primitiveToString(value);
    }

    return value;
  }
}

function primitiveToString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
}
