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
import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { agentRuns } from "./agents";
import { organizations, users } from "./organizations";
import { projectTranslationComments, projectTranslationKeys } from "./project-strings";
import { projects } from "./projects";

export type IssueSheetColumnConfig = {
  options?: { id: string; label: string; color?: string }[];
  agentKind?: "context" | "suggest_fix" | "custom";
  autoRun?: "never" | "on_create" | "on_source_change";
  readonly?: boolean;
};

export const issueSheetIssues = pgTable(
  "issue_sheet_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    issueType: text("issue_type").notNull().default("general_question"),
    status: text("status").notNull().default("open"),
    targetLocale: text("target_locale"),
    sourcePath: text("source_path"),
    segmentId: text("segment_id"),
    translationKeyId: uuid("translation_key_id").references(() => projectTranslationKeys.id, {
      onDelete: "set null",
    }),
    linkedCommentId: uuid("linked_comment_id").references(() => projectTranslationComments.id, {
      onDelete: "set null",
    }),
    linkedAgentRunId: uuid("linked_agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    linkKind: text("link_kind"),
    linkLabel: text("link_label"),
    linkUrl: text("link_url"),
    externalRef: text("external_ref"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_issue_sheet_issues_org_project_status").on(
      table.organizationId,
      table.projectId,
      table.status,
      table.createdAt,
    ),
    index("idx_issue_sheet_issues_project_locale").on(table.projectId, table.targetLocale),
    index("idx_issue_sheet_issues_linked_comment").on(table.linkedCommentId),
    index("idx_issue_sheet_issues_translation_key").on(table.translationKeyId),
    uniqueIndex("issue_sheet_issues_project_external_ref_key")
      .on(table.projectId, table.externalRef)
      .where(sql`${table.externalRef} IS NOT NULL`),
  ],
);

export const issueSheetColumns = pgTable(
  "issue_sheet_columns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    layer: text("layer").notNull().default("custom"),
    type: text("type").notNull(),
    config: jsonb("config")
      .$type<IssueSheetColumnConfig>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("issue_sheet_columns_project_key").on(table.projectId, table.key),
    index("idx_issue_sheet_columns_org_project").on(table.organizationId, table.projectId),
  ],
);

export const issueSheetRowValues = pgTable(
  "issue_sheet_row_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issueSheetIssues.id, { onDelete: "cascade" }),
    columnId: uuid("column_id")
      .notNull()
      .references(() => issueSheetColumns.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<unknown>(),
    computedAt: timestamp("computed_at", { withTimezone: true }),
    computedByAgentRunId: uuid("computed_by_agent_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("issue_sheet_row_values_issue_column").on(table.issueId, table.columnId),
    index("idx_issue_sheet_row_values_org_project").on(table.organizationId, table.projectId),
    index("idx_issue_sheet_row_values_column").on(table.columnId),
  ],
);

/**
 * Stores discussion comments on issue sheet issues using Path Enumeration
 * (materialized path) for threaded replies without recursive CTEs.
 */
export const issueSheetComments = pgTable(
  "issue_sheet_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issueSheetIssues.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    path: text("path").notNull(),
    depth: integer("depth").notNull().default(0),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    mentionedUserIds: jsonb("mentioned_user_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    mentionedIssueIds: jsonb("mentioned_issue_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "issue_sheet_comments_parent_id_issue_sheet_comments_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("issue_sheet_comments_issue_path_key").on(table.issueId, table.path),
    index("idx_issue_sheet_comments_issue_path").on(table.issueId, table.path),
    index("idx_issue_sheet_comments_issue_created").on(table.issueId, table.createdAt, table.id),
    index("idx_issue_sheet_comments_org_project_issue").on(
      table.organizationId,
      table.projectId,
      table.issueId,
    ),
    index("idx_issue_sheet_comments_parent").on(table.parentId),
  ],
);

export type IssueSheetActivityAssigneeChangedPayload = {
  previousAssigneeUserId: string | null;
  nextAssigneeUserId: string | null;
};

export type IssueSheetActivityIssueCreatedPayload = Record<string, never>;

export type IssueSheetActivityStatusChangedPayload = {
  previousStatus: string;
  nextStatus: string;
};

export type IssueSheetActivityPayload =
  | IssueSheetActivityAssigneeChangedPayload
  | IssueSheetActivityIssueCreatedPayload
  | IssueSheetActivityStatusChangedPayload;

/**
 * Stores non-comment issue events (assignee changes, and later status/link events)
 * for a unified discussion feed alongside comments.
 */
export const issueSheetActivities = pgTable(
  "issue_sheet_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issueSheetIssues.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    payload: jsonb("payload")
      .$type<IssueSheetActivityPayload>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_issue_sheet_activities_issue_created").on(table.issueId, table.createdAt, table.id),
    index("idx_issue_sheet_activities_org_project_issue").on(
      table.organizationId,
      table.projectId,
      table.issueId,
    ),
  ],
);

export type IssueNotificationType =
  | "assigned"
  | "mentioned"
  | "comment"
  | "status_changed"
  | "assignee_changed";

export type IssueNotificationPayload = {
  issueTitle: string;
  projectId: string;
  commentId?: string;
  commentExcerpt?: string;
  previousStatus?: string;
  nextStatus?: string;
  previousAssigneeUserId?: string | null;
  nextAssigneeUserId?: string | null;
};

/**
 * In-app inbox notifications for Issue Sheet activity (assignment, mentions,
 * comments, and relevant changes for implicit watchers).
 */
export const issueNotifications = pgTable(
  "issue_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issueSheetIssues.id, { onDelete: "cascade" }),
    type: text("type").$type<IssueNotificationType>().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload")
      .$type<IssueNotificationPayload>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("issue_notifications_recipient_dedupe_key").on(
      table.recipientUserId,
      table.dedupeKey,
    ),
    index("idx_issue_notifications_recipient_org_created").on(
      table.recipientUserId,
      table.organizationId,
      table.createdAt,
    ),
    index("idx_issue_notifications_recipient_org_unread").on(
      table.recipientUserId,
      table.organizationId,
      table.readAt,
    ),
    index("idx_issue_notifications_issue").on(table.issueId),
  ],
);
