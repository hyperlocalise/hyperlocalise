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

export const googleDriveFolders = pgTable(
  "google_drive_folders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectedByWorkosUserId: text("connected_by_workos_user_id").notNull(),
    driveId: text("drive_id"),
    folderId: text("folder_id").notNull(),
    name: text("name").notNull(),
    pathLabel: text("path_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("google_drive_folders_org_folder").on(table.organizationId, table.folderId),
    index("idx_google_drive_folders_org").on(table.organizationId),
  ],
);

export const googleDriveFileSyncStates = pgTable(
  "google_drive_file_sync_states",
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
    folderId: text("folder_id").notNull(),
    driveFileId: text("drive_file_id").notNull(),
    mimeType: text("mime_type").notNull(),
    ingestFormat: text("ingest_format").notNull(),
    sourcePath: text("source_path").notNull(),
    headRevisionId: text("head_revision_id"),
    md5Checksum: text("md5_checksum"),
    modifiedTime: timestamp("modified_time", { withTimezone: true }),
    sourceContentHash: text("source_content_hash").notNull(),
    translatedFileIds: jsonb("translated_file_ids")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    localeFolderIds: jsonb("locale_folder_ids")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
    lastPushedAt: timestamp("last_pushed_at", { withTimezone: true }),
    lastPushContentHash: jsonb("last_push_content_hash")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status")
      .$type<"active" | "skipped" | "import_failed" | "push_failed">()
      .notNull()
      .default("active"),
    skipReason: text("skip_reason"),
    lastError: jsonb("last_error").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("google_drive_file_sync_automation_file").on(table.automationId, table.driveFileId),
    index("idx_google_drive_file_sync_automation").on(table.automationId),
    index("idx_google_drive_file_sync_project").on(table.projectId),
  ],
);

export const googleDriveSyncCursors = pgTable(
  "google_drive_sync_cursors",
  {
    automationId: uuid("automation_id")
      .primaryKey()
      .references(() => workspaceAutomations.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    pageTokensByDriveId: jsonb("page_tokens_by_drive_id")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("idx_google_drive_sync_cursors_org").on(table.organizationId)],
);
