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
 * Per-user Braze REST cluster for a workspace.
 * The API key lives in WorkOS Pipes. This table stores only the allowlisted
 * instance key (for example `iad-03`).
 */
export const brazeConnectionSettings = pgTable(
  "braze_connection_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workosUserId: text("workos_user_id").notNull(),
    /** Allowlisted Braze REST cluster key, for example `iad-03`. */
    restEndpoint: text("rest_endpoint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("braze_connection_settings_org_user_key").on(
      table.organizationId,
      table.workosUserId,
    ),
    index("idx_braze_connection_settings_org").on(table.organizationId),
  ],
);

export const brazeTemplateSyncStates = pgTable(
  "braze_template_sync_states",
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
    resourceKind: text("resource_kind").$type<"email_template" | "content_block">().notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceLocale: text("source_locale").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    sourceContentHash: text("source_content_hash").notNull(),
    liquidTokens: jsonb("liquid_tokens")
      .$type<Record<string, string[]>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    localeCopyIds: jsonb("locale_copy_ids")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    localeCopyNames: jsonb("locale_copy_names")
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
    uniqueIndex("braze_template_sync_org_automation_resource").on(
      table.organizationId,
      table.automationId,
      table.resourceKind,
      table.sourceId,
    ),
    index("idx_braze_template_sync_automation").on(table.automationId),
    index("idx_braze_template_sync_project").on(table.projectId),
  ],
);

export const brazeSyncCursors = pgTable(
  "braze_sync_cursors",
  {
    automationId: uuid("automation_id")
      .primaryKey()
      .references(() => workspaceAutomations.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    emailWatermarkUpdatedAt: timestamp("email_watermark_updated_at", { withTimezone: true }),
    contentBlockWatermarkUpdatedAt: timestamp("content_block_watermark_updated_at", {
      withTimezone: true,
    }),
    campaignWatermarkUpdatedAt: timestamp("campaign_watermark_updated_at", { withTimezone: true }),
    canvasWatermarkUpdatedAt: timestamp("canvas_watermark_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("idx_braze_sync_cursors_org").on(table.organizationId)],
);

export const brazeCampaignSyncStates = pgTable(
  "braze_campaign_sync_states",
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
    resourceKind: text("resource_kind").$type<"campaign" | "canvas_step">().notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourcePath: text("source_path").notNull(),
    campaignId: text("campaign_id"),
    workflowId: text("workflow_id"),
    stepId: text("step_id"),
    messageVariationId: text("message_variation_id").notNull(),
    sourceLocale: text("source_locale").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    sourceContentHash: text("source_content_hash").notNull(),
    translationKeys: jsonb("translation_keys")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    localeIds: jsonb("locale_ids")
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
    uniqueIndex("braze_campaign_sync_org_automation_resource").on(
      table.organizationId,
      table.automationId,
      table.resourceKind,
      table.sourceId,
    ),
    index("idx_braze_campaign_sync_automation").on(table.automationId),
    index("idx_braze_campaign_sync_project").on(table.projectId),
  ],
);
