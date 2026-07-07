import { sql } from "drizzle-orm";
import {
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
