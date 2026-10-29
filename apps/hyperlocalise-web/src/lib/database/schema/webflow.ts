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
 * Webflow site scope for an organization. The site token lives in WorkOS Pipes
 * (per connecting user). Automations reference connectionId + siteId.
 */
export const webflowConnections = pgTable(
  "webflow_connections",
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
    siteId: text("site_id").notNull(),
    collectionIds: jsonb("collection_ids")
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
    uniqueIndex("webflow_connections_org_site_user_key").on(
      table.organizationId,
      table.siteId,
      table.pipesWorkosUserId,
    ),
    index("idx_webflow_connections_org").on(table.organizationId),
  ],
);

export const webflowSyncCursors = pgTable(
  "webflow_sync_cursors",
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
  (table) => [index("idx_webflow_sync_cursors_org").on(table.organizationId)],
);

export const webflowItemSyncStates = pgTable(
  "webflow_item_sync_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id").notNull(),
    siteId: text("site_id").notNull(),
    collectionId: text("collection_id").notNull(),
    itemId: text("item_id").notNull(),
    slug: text("slug").notNull(),
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
    uniqueIndex("webflow_item_sync_states_automation_item_key").on(
      table.automationId,
      table.itemId,
    ),
    index("idx_webflow_item_sync_states_org").on(table.organizationId),
  ],
);
