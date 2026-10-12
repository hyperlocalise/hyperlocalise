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
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { repositorySourceFiles, storedFiles } from "./files";
import { organizations, users } from "./organizations";
import { projects } from "./projects";
import { projectTranslationKeys } from "./project-strings";

/**
 * Stores uploaded screenshots used as CAT visual context for native projects.
 * Bytes live in object storage; `stored_file_id` is set after the upload is finalized.
 */
export const projectVisualContextScreenshots = pgTable(
  "project_visual_context_screenshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    storedFileId: text("stored_file_id").references(() => storedFiles.id, {
      onDelete: "cascade",
    }),
    name: text("name"),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    objectLocation: text("object_location").notNull(),
    objectKey: text("object_key").notNull(),
    status: text("status").notNull().default("upload_pending"),
    width: integer("width"),
    height: integer("height"),
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
    uniqueIndex("project_visual_context_screenshots_object").on(
      table.objectLocation,
      table.objectKey,
    ),
    index("idx_project_visual_context_screenshots_org_project").on(
      table.organizationId,
      table.projectId,
    ),
    index("idx_project_visual_context_screenshots_stored_file").on(table.storedFileId),
    check(
      "project_visual_context_screenshots_status_check",
      sql`${table.status} in ('upload_pending', 'ready')`,
    ),
    check(
      "project_visual_context_screenshots_ready_file_check",
      sql`(${table.status} = 'upload_pending' and ${table.storedFileId} is null) or (${table.status} = 'ready' and ${table.storedFileId} is not null)`,
    ),
    check(
      "project_visual_context_screenshots_content_type_check",
      sql`${table.contentType} in ('image/png', 'image/jpeg', 'image/webp')`,
    ),
  ],
);

/**
 * Async OCR match runs that bind strings to a screenshot, modelled on Smartling's
 * context match processes. Scope is a source file, explicit keys, or (both null)
 * the whole project. Processed by `apps/visual-context-match-lambda`.
 */
export const projectVisualContextMatchProcesses = pgTable(
  "project_visual_context_match_processes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    screenshotId: uuid("screenshot_id")
      .notNull()
      .references(() => projectVisualContextScreenshots.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    repositorySourceFileId: uuid("repository_source_file_id").references(
      () => repositorySourceFiles.id,
      { onDelete: "cascade" },
    ),
    translationKeyIds: uuid("translation_key_ids").array(),
    overrideContextOlderThanDays: integer("override_context_older_than_days"),
    checkedStringsCount: integer("checked_strings_count"),
    boundStringsCount: integer("bound_strings_count"),
    errorCode: text("error_code"),
    attempts: integer("attempts").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_project_visual_context_match_processes_org_project").on(
      table.organizationId,
      table.projectId,
    ),
    uniqueIndex("project_visual_context_match_processes_active_screenshot")
      .on(table.screenshotId)
      .where(sql`${table.status} in ('queued', 'in_progress')`),
    check(
      "project_visual_context_match_processes_status_check",
      sql`${table.status} in ('queued', 'in_progress', 'completed', 'failed')`,
    ),
    check(
      "project_visual_context_match_processes_scope_check",
      sql`${table.repositorySourceFileId} is null or ${table.translationKeyIds} is null`,
    ),
    check(
      "project_visual_context_match_processes_override_check",
      sql`${table.overrideContextOlderThanDays} is null or ${table.overrideContextOlderThanDays} >= 1`,
    ),
  ],
);

/**
 * Binds a visual-context screenshot to a native translation key, with optional
 * percent-based markers that highlight the string on the image. `source` is
 * `auto` for OCR matches; auto matches never overwrite manual bindings.
 */
export const projectVisualContextBindings = pgTable(
  "project_visual_context_bindings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    screenshotId: uuid("screenshot_id")
      .notNull()
      .references(() => projectVisualContextScreenshots.id, { onDelete: "cascade" }),
    translationKeyId: uuid("translation_key_id")
      .notNull()
      .references(() => projectTranslationKeys.id, { onDelete: "cascade" }),
    markerLeft: doublePrecision("marker_left"),
    markerTop: doublePrecision("marker_top"),
    markerWidth: doublePrecision("marker_width"),
    markerHeight: doublePrecision("marker_height"),
    source: text("source").notNull().default("manual"),
    matchProcessId: uuid("match_process_id").references(
      () => projectVisualContextMatchProcesses.id,
      { onDelete: "set null" },
    ),
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
    uniqueIndex("project_visual_context_bindings_screenshot_key").on(
      table.screenshotId,
      table.translationKeyId,
    ),
    index("idx_project_visual_context_bindings_key").on(
      table.organizationId,
      table.projectId,
      table.translationKeyId,
    ),
    index("idx_project_visual_context_bindings_screenshot").on(table.screenshotId),
    index("idx_project_visual_context_bindings_match_process").on(table.matchProcessId),
    check(
      "project_visual_context_bindings_source_check",
      sql`${table.source} in ('manual', 'auto')`,
    ),
    check(
      "project_visual_context_bindings_marker_check",
      sql`(
        ${table.markerLeft} is null
        and ${table.markerTop} is null
        and ${table.markerWidth} is null
        and ${table.markerHeight} is null
      ) or (
        ${table.markerLeft} is not null
        and ${table.markerTop} is not null
        and ${table.markerWidth} is not null
        and ${table.markerHeight} is not null
        and ${table.markerLeft} >= 0 and ${table.markerLeft} <= 100
        and ${table.markerTop} >= 0 and ${table.markerTop} <= 100
        and ${table.markerWidth} > 0 and ${table.markerWidth} <= 100
        and ${table.markerHeight} > 0 and ${table.markerHeight} <= 100
        and ${table.markerLeft} + ${table.markerWidth} <= 100.000001
        and ${table.markerTop} + ${table.markerHeight} <= 100.000001
      )`,
    ),
  ],
);
