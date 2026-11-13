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

import type { SanityJsonObject } from "@/lib/sanity/sanity-field-value";

import { workspaceAutomations } from "./agents";
import { organizations } from "./organizations";
import { projects } from "./projects";

export const sanityDocumentSyncStates = pgTable(
  "sanity_document_sync_states",
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
    sanityProjectId: text("sanity_project_id").notNull(),
    dataset: text("dataset").notNull(),
    documentType: text("document_type").notNull(),
    documentId: text("document_id").notNull(),
    i18nMode: text("i18n_mode").$type<"document" | "field">().notNull(),
    sourcePath: text("source_path").notNull(),
    sourceLocale: text("source_locale").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    sourceContentHash: text("source_content_hash").notNull(),
    translatedDocumentIds: jsonb("translated_document_ids")
      .$type<Record<string, string>>()
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
    status: text("status")
      .$type<"active" | "archived" | "import_failed" | "push_failed">()
      .notNull()
      .default("active"),
    lastError: jsonb("last_error").$type<SanityJsonObject | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("sanity_document_sync_org_automation_document").on(
      table.organizationId,
      table.automationId,
      table.documentId,
    ),
    index("idx_sanity_document_sync_automation").on(table.automationId),
    index("idx_sanity_document_sync_project").on(table.projectId),
  ],
);

export const sanitySyncCursors = pgTable(
  "sanity_sync_cursors",
  {
    automationId: uuid("automation_id")
      .primaryKey()
      .references(() => workspaceAutomations.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    watermarkUpdatedAt: timestamp("watermark_updated_at", { withTimezone: true }),
    listCursor: text("list_cursor"),
    lastReconcileAt: timestamp("last_reconcile_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("idx_sanity_sync_cursors_org").on(table.organizationId)],
);
