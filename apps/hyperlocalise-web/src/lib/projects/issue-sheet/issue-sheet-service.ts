import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import {
  type IssueSheetCreateColumnBody,
  type IssueSheetCreateIssueBody,
  type IssueSheetQuery,
  type IssueSheetSetValueBody,
  type IssueSheetUpdateIssueBody,
} from "@/api/routes/project/issue-sheet.schema";
import { db, schema } from "@/lib/database";

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
};

export type IssueSheetListResult = {
  issues: IssueSheetIssue[];
  columns: IssueSheetColumn[];
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

    const rows = await this.database
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
        key: schema.projectTranslationKeys.key,
        sourceText: schema.projectTranslationKeys.sourceText,
        createdAt: schema.issueSheetIssues.createdAt,
        updatedAt: schema.issueSheetIssues.updatedAt,
        resolvedAt: schema.issueSheetIssues.resolvedAt,
      })
      .from(schema.issueSheetIssues)
      .leftJoin(schema.users, eq(schema.issueSheetIssues.reporterUserId, schema.users.id))
      .leftJoin(
        schema.projectTranslationKeys,
        eq(schema.issueSheetIssues.translationKeyId, schema.projectTranslationKeys.id),
      )
      .where(and(...conditions))
      .orderBy(desc(schema.issueSheetIssues.createdAt))
      .limit(input.query.limit)
      .offset(input.query.offset);

    const issueIds = rows.map((row) => row.id);
    const valuesByIssueId = await this.loadValuesByIssueId({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueIds,
      columns,
    });

    const summary = await this.loadSummary(input);

    return {
      columns,
      summary,
      issues: rows.map((row) => ({
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
        assignee: null,
        key: row.key,
        sourceText: row.sourceText,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        values: valuesByIssueId.get(row.id) ?? {},
      })),
    };
  }

  async createIssue(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
    body: IssueSheetCreateIssueBody;
  }): Promise<IssueSheetIssue> {
    await this.ensureStarterColumns(input);
    const existing = await this.findExistingLinkedOpenIssue(input);
    if (existing) {
      return existing;
    }

    const [issue] = await this.database
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
        assigneeUserId: input.body.assigneeUserId ?? null,
        resolvedAt:
          input.body.status === "resolved" || input.body.status === "wont_fix" ? new Date() : null,
      })
      .returning({ id: schema.issueSheetIssues.id });

    if (!issue) {
      throw new Error("issue_sheet_issue_create_failed");
    }

    if (input.body.priority) {
      await this.setValue({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: issue.id,
        body: { columnKey: "priority", value: input.body.priority },
      });
    }

    const created = await this.getIssueById({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: issue.id,
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

    const [updated] = await this.database
      .update(schema.issueSheetIssues)
      .set({
        title: input.body.title,
        description: input.body.description,
        issueType: input.body.issueType,
        status: input.body.status,
        targetLocale: input.body.targetLocale,
        sourcePath: input.body.sourcePath,
        segmentId: input.body.segmentId,
        linkKind: input.body.linkKind,
        linkLabel: input.body.linkLabel,
        linkUrl: input.body.linkUrl,
        assigneeUserId: input.body.assigneeUserId,
        ...(resolvedAt !== undefined ? { resolvedAt } : {}),
      })
      .where(
        and(
          eq(schema.issueSheetIssues.organizationId, input.organizationId),
          eq(schema.issueSheetIssues.projectId, input.projectId),
          eq(schema.issueSheetIssues.id, input.issueId),
        ),
      )
      .returning({ id: schema.issueSheetIssues.id });

    if (!updated) {
      return null;
    }

    return this.getIssueById(input);
  }

  async setValue(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    body: IssueSheetSetValueBody;
  }) {
    await this.ensureStarterColumns(input);
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

  private async findExistingLinkedOpenIssue(input: {
    organizationId: string;
    projectId: string;
    actorUserId: string;
    body: IssueSheetCreateIssueBody;
  }) {
    const conditions: SQL[] = [
      eq(schema.issueSheetIssues.organizationId, input.organizationId),
      eq(schema.issueSheetIssues.projectId, input.projectId),
      inArray(schema.issueSheetIssues.status, ["open", "in_progress"]),
    ];

    const linkConditions: SQL[] = [];
    if (input.body.externalRef) {
      linkConditions.push(eq(schema.issueSheetIssues.externalRef, input.body.externalRef));
    }
    if (input.body.linkedCommentId) {
      linkConditions.push(eq(schema.issueSheetIssues.linkedCommentId, input.body.linkedCommentId));
    }
    if (input.body.segmentId && input.body.targetLocale) {
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

    conditions.push(or(...linkConditions)!);

    const [existing] = await this.database
      .select({ id: schema.issueSheetIssues.id })
      .from(schema.issueSheetIssues)
      .where(and(...conditions))
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

  private async getIssueById(input: {
    organizationId: string;
    projectId: string;
    issueId: string;
    actorUserId: string;
  }) {
    const result = await this.listIssues({
      organizationId: input.organizationId,
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      query: {
        limit: 1,
        offset: 0,
        search: undefined,
        status: "all",
        issueType: "all",
      },
      issueId: input.issueId,
    });
    return result.issues.find((issue) => issue.id === input.issueId) ?? null;
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
    ];
    if ("issueId" in input && input.issueId) {
      conditions.push(eq(schema.issueSheetIssues.id, input.issueId));
    }

    const view = input.query.view;
    if (view === "my_work") {
      conditions.push(eq(schema.issueSheetIssues.assigneeUserId, input.actorUserId));
      conditions.push(inArray(schema.issueSheetIssues.status, ["open", "in_progress"]));
    } else if (view === "qa_triage") {
      conditions.push(eq(schema.issueSheetIssues.issueType, "qa_failure"));
      conditions.push(isNull(schema.issueSheetIssues.assigneeUserId));
      conditions.push(inArray(schema.issueSheetIssues.status, ["open", "in_progress"]));
    } else if (view === "source_context") {
      conditions.push(
        inArray(schema.issueSheetIssues.issueType, [
          "source_mistake",
          "context_request",
          "general_question",
        ]),
      );
      conditions.push(inArray(schema.issueSheetIssues.status, ["open", "in_progress"]));
    } else if (view === "all_open") {
      conditions.push(inArray(schema.issueSheetIssues.status, ["open", "in_progress"]));
    }

    if (input.query.status && input.query.status !== "all") {
      conditions.push(eq(schema.issueSheetIssues.status, input.query.status));
    }
    if (input.query.issueType && input.query.issueType !== "all") {
      conditions.push(eq(schema.issueSheetIssues.issueType, input.query.issueType));
    }
    if (input.query.locale) {
      conditions.push(eq(schema.issueSheetIssues.targetLocale, input.query.locale));
    }
    if (input.query.assignee === "me") {
      conditions.push(eq(schema.issueSheetIssues.assigneeUserId, input.actorUserId));
    } else if (input.query.assignee === "unassigned") {
      conditions.push(isNull(schema.issueSheetIssues.assigneeUserId));
    } else if (input.query.assignee) {
      conditions.push(eq(schema.issueSheetIssues.assigneeUserId, input.query.assignee));
    }
    if (input.query.search) {
      const search = `%${input.query.search}%`;
      conditions.push(
        or(
          ilike(schema.issueSheetIssues.title, search),
          ilike(schema.issueSheetIssues.description, search),
          ilike(schema.issueSheetIssues.sourcePath, search),
        )!,
      );
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
