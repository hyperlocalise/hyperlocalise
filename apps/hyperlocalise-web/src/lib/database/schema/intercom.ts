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
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { workspaceAutomations } from "./agents";
import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Org-level Intercom access token connections.
 * Regional REST endpoint is an allowlisted value (`us` | `eu` | `au`).
 * Runtime authenticates with the Intercom Node SDK (`intercom-client`).
 */
export const intercomConnections = pgTable(
  "intercom_connections",
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
    /** Allowlisted regional host key: `us` | `eu` | `au`. */
    restEndpoint: text("rest_endpoint").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    validationStatus: text("validation_status").notNull().default("unvalidated"),
    validationMessage: text("validation_message"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    encryptionAlgorithm: text("encryption_algorithm").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    maskedAccessTokenSuffix: text("masked_access_token_suffix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("idx_intercom_connections_org").on(table.organizationId)],
);

export const intercomArticleSyncStates = pgTable(
  "intercom_article_sync_states",
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
    intercomAppId: text("intercom_app_id"),
    helpCenterId: text("help_center_id").notNull(),
    articleId: text("article_id").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceLocale: text("source_locale").notNull(),
    intercomDefaultLocale: text("intercom_default_locale"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    sourceContentHash: text("source_content_hash").notNull(),
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
    lastError: jsonb("last_error").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("intercom_article_sync_org_automation_article").on(
      table.organizationId,
      table.automationId,
      table.articleId,
    ),
    index("idx_intercom_article_sync_automation").on(table.automationId),
    index("idx_intercom_article_sync_project").on(table.projectId),
  ],
);

export const intercomSyncCursors = pgTable(
  "intercom_sync_cursors",
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
  (table) => [index("idx_intercom_sync_cursors_org").on(table.organizationId)],
);
