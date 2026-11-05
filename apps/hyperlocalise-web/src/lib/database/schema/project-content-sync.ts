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
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";
import { projects } from "./projects";

export type ProjectContentSyncSchedule = "manual" | "hourly" | "daily";
export type ProjectContentSyncRunTrigger = "manual" | "scheduled";
export type ProjectContentSyncRunStatus = "running" | "succeeded" | "failed";

/**
 * A project's built-in content sync: one per project, in the settings shape
 * `executeContentSyncConfig` takes. Not a workspace automation.
 */
export const projectContentSyncs = pgTable(
  "project_content_syncs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    syncConfig: jsonb("sync_config").$type<Record<string, unknown>>().notNull(),
    schedule: text("schedule").$type<ProjectContentSyncSchedule>().notNull().default("manual"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_content_syncs_project_key").on(table.projectId),
    index("idx_project_content_syncs_next_run").on(table.nextRunAt),
  ],
);

/**
 * One run of a project's content sync. A `running` row is the run's lease: claiming a
 * run checks for one under a transaction-scoped advisory lock keyed by the sync.
 */
export const projectContentSyncRuns = pgTable(
  "project_content_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    syncId: uuid("sync_id")
      .notNull()
      .references(() => projectContentSyncs.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<ProjectContentSyncRunTrigger>().notNull(),
    status: text("status").$type<ProjectContentSyncRunStatus>().notNull().default("running"),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // The provider's run summary (`ContentSyncSummary`), including any pull or merge request link.
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_project_content_sync_runs_sync_created").on(table.syncId, table.createdAt),
    index("idx_project_content_sync_runs_status_started").on(table.status, table.startedAt),
  ],
);
