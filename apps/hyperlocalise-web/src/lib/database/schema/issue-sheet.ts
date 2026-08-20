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
  boolean,
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
    // Which static issue template (if any) prefilled this issue at creation time.
    // Provenance only: no FK to a template table (definitions are static code, not rows), and
    // deliberately not kept in sync with issueType if the two diverge after creation.
    templateKey: text("template_key"),
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
    hidden: boolean("hidden").notNull().default(false),
    icon: text("icon"),
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

export type IssueSheetActivityIssueTypeChangedPayload = {
  previousIssueType: string;
  nextIssueType: string;
};

export type IssueSheetActivityPriorityChangedPayload = {
  previousPriority: string | null;
  nextPriority: string;
};

export type IssueSheetActivityRelationshipAddedPayload = {
  relatedIssueId: string;
  kind: string;
};

export type IssueSheetActivityRelationshipRemovedPayload = {
  relatedIssueId: string;
  kind: string;
};

export type IssueSheetActivityRoutingRecipeAppliedPayload = {
  recipeId: string;
  recipeName: string;
  actionsApplied: {
    assigneeUserId?: string;
    priority?: string;
  };
};

export type IssueSheetActivityPayload =
  | IssueSheetActivityAssigneeChangedPayload
  | IssueSheetActivityIssueCreatedPayload
  | IssueSheetActivityStatusChangedPayload
  | IssueSheetActivityIssueTypeChangedPayload
  | IssueSheetActivityPriorityChangedPayload
  | IssueSheetActivityRelationshipAddedPayload
  | IssueSheetActivityRelationshipRemovedPayload
  | IssueSheetActivityRoutingRecipeAppliedPayload;

export type IssueRoutingRecipeConditions = {
  issueTypes?: string[];
  targetLocales?: string[];
  priorities?: string[];
};

export type IssueRoutingRecipeActions = {
  assigneeUserId?: string;
  priority?: string;
};

/**
 * Predefined triage rules: match new issues on type, locale, or priority and assign
 * owners or set priority on create.
 */
export const issueSheetRoutingRecipes = pgTable(
  "issue_sheet_routing_recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    conditions: jsonb("conditions")
      .$type<IssueRoutingRecipeConditions>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    actions: jsonb("actions")
      .$type<IssueRoutingRecipeActions>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_issue_sheet_routing_recipes_project_order").on(
      table.projectId,
      table.sortOrder,
      table.id,
    ),
    index("idx_issue_sheet_routing_recipes_org_project").on(table.organizationId, table.projectId),
  ],
);

/**
 * Admin-visible log when routing recipe execution fails without blocking issue create.
 */
export const issueSheetRoutingFailures = pgTable(
  "issue_sheet_routing_failures",
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
    recipeId: uuid("recipe_id").references(() => issueSheetRoutingRecipes.id, {
      onDelete: "set null",
    }),
    errorCode: text("error_code").notNull(),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_issue_sheet_routing_failures_project_created").on(table.projectId, table.createdAt),
    index("idx_issue_sheet_routing_failures_issue").on(table.issueId),
  ],
);

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

export const issueSheetRelationshipKinds = ["related", "blocks", "duplicate_of"] as const;
export type IssueSheetRelationshipKind = (typeof issueSheetRelationshipKinds)[number];

/**
 * Stores directed issue-to-issue relationships (related, blocks, duplicate_of).
 * "blocked_by" is not stored separately — it's the inverse read of a "blocks" row
 * (relatedIssueId = this issue, kind = "blocks" means "this issue is blocked by issueId").
 */
export const issueSheetRelationships = pgTable(
  "issue_sheet_relationships",
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
    relatedIssueId: uuid("related_issue_id")
      .notNull()
      .references(() => issueSheetIssues.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_issue_sheet_relationships_issue_kind").on(table.issueId, table.kind),
    index("idx_issue_sheet_relationships_related_kind").on(table.relatedIssueId, table.kind),
    uniqueIndex("issue_sheet_relationships_edge_key").on(
      table.issueId,
      table.relatedIssueId,
      table.kind,
    ),
    uniqueIndex("issue_sheet_relationships_one_canonical_key")
      .on(table.issueId)
      .where(sql`${table.kind} = 'duplicate_of'`),
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
 * Explicit issue subscriptions for users who should receive updates.
 * Rows are created by watch, assignment, comments, and mentions; removed only
 * by explicit unwatch or issue deletion (cascade).
 */
export const issueSheetSubscriptions = pgTable(
  "issue_sheet_subscriptions",
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
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("issue_sheet_subscriptions_issue_user_key").on(table.issueId, table.userId),
    index("idx_issue_sheet_subscriptions_user_org").on(table.userId, table.organizationId),
    index("idx_issue_sheet_subscriptions_issue").on(table.issueId),
  ],
);

/**
 * In-app inbox notifications for Issue Sheet activity (assignment, mentions,
 * comments, and relevant changes for subscribers).
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
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
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
    index("idx_issue_notifications_email_digest").on(
      table.emailedAt,
      table.readAt,
      table.createdAt,
    ),
  ],
);

export type UserNotificationEmailFormat = "digest" | "immediate";

/**
 * Account-scoped preferences for Issue Sheet Inbox email delivery.
 * Subscribe/watch remains eligibility; this table only controls the email channel.
 */
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  emailFormat: text("email_format")
    .$type<UserNotificationEmailFormat>()
    .notNull()
    .default("digest"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});
