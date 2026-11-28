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
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { workspaceAutomations } from "./agents";
import { organizations, users } from "./organizations";

/**
 * Storyblok space for an organization. The personal access token lives in
 * WorkOS Pipes (per connecting user). Automations reference connectionId.
 */
export const storyblokConnections = pgTable(
  "storyblok_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    spaceId: text("space_id").notNull(),
    /** Management API region key: eu, us, ca, ap or cn. */
    region: text("region").notNull().default("eu"),
    /** Folder full slugs to import from. Empty means every story in the space. */
    folderSlugs: jsonb("folder_slugs")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    pipesWorkosUserId: text("pipes_workos_user_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    validationStatus: text("validation_status").notNull().default("unvalidated"),
    validationMessage: text("validation_message"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    maskedTokenSuffix: text("masked_token_suffix"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("storyblok_connections_org_space_user_key").on(
      table.organizationId,
      table.spaceId,
      table.pipesWorkosUserId,
    ),
    index("idx_storyblok_connections_org").on(table.organizationId),
  ],
);

export const storyblokSyncCursors = pgTable(
  "storyblok_sync_cursors",
  {
    automationId: uuid("automation_id")
      .primaryKey()
      .references(() => workspaceAutomations.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    watermarkUpdatedAt: timestamp("watermark_updated_at", { withTimezone: true }),
    /** Folder slugs the watermark was computed for; a change resets it. */
    scopeKey: text("scope_key"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("idx_storyblok_sync_cursors_org").on(table.organizationId)],
);

export const storyblokStorySyncStates = pgTable(
  "storyblok_story_sync_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => workspaceAutomations.id, { onDelete: "cascade" }),
    spaceId: text("space_id").notNull(),
    storyId: text("story_id").notNull(),
    fullSlug: text("full_slug").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceHash: text("source_hash").notNull(),
    lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
    lastPushedAt: timestamp("last_pushed_at", { withTimezone: true }),
    pushRecords: jsonb("push_records")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("storyblok_story_sync_states_automation_story_key").on(
      table.automationId,
      table.storyId,
    ),
    index("idx_storyblok_story_sync_states_org").on(table.organizationId),
  ],
);
