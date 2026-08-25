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
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";

/**
 * Persists explicit CAT segment locks for native and external TMS projects.
 * `project_id` is the API project id (`ext:crowdin:42` for TMS, native UUID otherwise).
 * Identity is per target locale + external string id — not derived from approved/hidden.
 */
export const projectCatSegmentLocks = pgTable(
  "project_cat_segment_locks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull(),
    targetLocale: text("target_locale").notNull(),
    externalStringId: text("external_string_id").notNull(),
    lockedByUserId: uuid("locked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_cat_segment_locks_lookup").on(
      table.organizationId,
      table.projectId,
      table.targetLocale,
      table.externalStringId,
    ),
    index("idx_project_cat_segment_locks_locale").on(
      table.organizationId,
      table.projectId,
      table.targetLocale,
    ),
  ],
);
