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
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { workspaceAutomations } from "./agents";
import { organizations } from "./organizations";
import { projects } from "./projects";

/**
 * Per-email Loops sync state. The project file is an HTML envelope; the
 * original LMX plus variable tokens live here so Push can splice approved
 * translations back into the same LMX tags.
 */
export const loopsEmailSyncStates = pgTable(
  "loops_email_sync_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => workspaceAutomations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    resourceKind: text("resource_kind")
      .$type<"transactional" | "campaign" | "workflow">()
      .notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourcePath: text("source_path").notNull(),
    emailMessageId: text("email_message_id"),
    parentId: text("parent_id"),
    parentName: text("parent_name"),
    sourceLocale: text("source_locale").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    sourceContentHash: text("source_content_hash").notNull(),
    sourceLmx: text("source_lmx").notNull().default(""),
    segmentCount: text("segment_count").notNull().default("0"),
    variableTokens: jsonb("variable_tokens")
      .$type<string[][]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    localeCopyIds: jsonb("locale_copy_ids")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    localeCopyNames: jsonb("locale_copy_names")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
    lastPushedAt: timestamp("last_pushed_at", { withTimezone: true }),
    lastPushContentHash: jsonb("last_push_content_hash")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    extra: jsonb("extra")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status")
      .$type<"active" | "archived" | "import_failed" | "push_failed">()
      .notNull()
      .default("active"),
    lastError: jsonb("last_error").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("loops_email_sync_org_automation_resource").on(
      table.organizationId,
      table.automationId,
      table.resourceKind,
      table.sourceId,
    ),
    index("idx_loops_email_sync_automation").on(table.automationId),
    index("idx_loops_email_sync_project").on(table.projectId),
  ],
);
