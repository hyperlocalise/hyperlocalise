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
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";
import { glossaries } from "./translation-memory";

export const glossaryImportRuns = pgTable(
  "glossary_import_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    glossaryId: uuid("glossary_id")
      .notNull()
      .references(() => glossaries.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    format: text("format").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    sourceFilename: text("source_filename"),
    sourceSha256: text("source_sha256"),
    options: jsonb("options")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    sourceTotals: jsonb("source_totals")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    counts: jsonb("counts")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    backupFileId: text("backup_file_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_glossary_import_runs_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_glossary_import_runs_glossary_created_at").on(table.glossaryId, table.createdAt),
  ],
);

export const glossaryImportReportEntries = pgTable(
  "glossary_import_report_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => glossaryImportRuns.id, { onDelete: "cascade" }),
    severity: text("severity").notNull(),
    code: text("code").notNull(),
    message: text("message").notNull(),
    sourceRow: integer("source_row"),
    conceptId: text("concept_id"),
    termId: text("term_id"),
    field: text("field"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_glossary_import_report_entries_run_id").on(table.runId)],
);
