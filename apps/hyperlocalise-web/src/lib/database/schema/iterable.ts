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
 * Per-user Iterable data center for a workspace.
 * The API key lives in WorkOS Pipes. This table stores only the allowlisted
 * region key (`us` or `eu`).
 */
export const iterableConnectionSettings = pgTable(
  "iterable_connection_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workosUserId: text("workos_user_id").notNull(),
    /** Allowlisted Iterable data center key, `us` or `eu`. */
    region: text("region").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("iterable_connection_settings_org_user_key").on(
      table.organizationId,
      table.workosUserId,
    ),
    index("idx_iterable_connection_settings_org").on(table.organizationId),
  ],
);

export const iterableTemplateSyncStates = pgTable(
  "iterable_template_sync_states",
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
      .$type<"email" | "in_app" | "push" | "sms" | "snippet">()
      .notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceLocale: text("source_locale").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    sourceContentHash: text("source_content_hash").notNull(),
    editorKind: text("editor_kind")
      .$type<"wysiwyg" | "side_by_side" | "drag_and_drop">()
      .notNull()
      .default("drag_and_drop"),
    /** WYSIWYG clone template id for drag-and-drop email/in-app sources. */
    cloneTemplateId: text("clone_template_id"),
    handlebarsTokens: jsonb("handlebars_tokens")
      .$type<Record<string, string[]>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
    lastPushedAt: timestamp("last_pushed_at", { withTimezone: true }),
    lastPushContentHash: jsonb("last_push_content_hash")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    importedTranslationHashes: jsonb("imported_translation_hashes")
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
    uniqueIndex("iterable_template_sync_org_automation_resource").on(
      table.organizationId,
      table.automationId,
      table.resourceKind,
      table.sourceId,
    ),
    index("idx_iterable_template_sync_automation").on(table.automationId),
    index("idx_iterable_template_sync_project").on(table.projectId),
  ],
);
