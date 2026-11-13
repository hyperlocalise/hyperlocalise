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
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Native project version branches, matching Phrase Strings / Crowdin version
 * branches: a named copy of files and strings that can be synced and merged.
 */
export const projectBranches = pgTable(
  "project_branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade", onUpdate: "cascade" }),
    /** Git-style name shown in the picker and stored on files and keys. */
    name: text("name").notNull(),
    /** Optional longer label; the picker falls back to `name`. */
    title: text("title"),
    baseBranchId: uuid("base_branch_id").references((): AnyPgColumn => projectBranches.id, {
      onDelete: "set null",
    }),
    isDefault: boolean("is_default").notNull().default(false),
    isProtected: boolean("is_protected").notNull().default(false),
    status: text("status", { enum: ["active", "merged"] })
      .notNull()
      .default("active"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    mergedIntoBranchId: uuid("merged_into_branch_id").references(
      (): AnyPgColumn => projectBranches.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_branches_project_active_name_key")
      .on(table.projectId, table.name)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("project_branches_project_default_key")
      .on(table.projectId)
      .where(sql`${table.isDefault}`),
    index("idx_project_branches_org_project").on(table.organizationId, table.projectId),
    index("idx_project_branches_base").on(table.baseBranchId),
    check("project_branches_status_check", sql`${table.status} in ('active', 'merged')`),
    check(
      "project_branches_name_check",
      sql`char_length(${table.name}) between 1 and 128 and ${table.name} !~ '[^A-Za-z0-9._/-]' and ${table.name} !~ '^[./-]' and ${table.name} !~ '[./-]$' and ${table.name} !~ '//'`,
    ),
  ],
);
