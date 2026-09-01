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

import { organizationApiKeys } from "./integrations";
import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Stores per-organization Canva app connections bound to an API key and default project settings.
 * The Canva iframe authenticates with a connection token plus Canva JWT on localize requests.
 */
export const canvaConnections = pgTable(
  "canva_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => organizationApiKeys.id, { onDelete: "restrict" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    sourceLocale: text("source_locale").notNull().default("en"),
    targetLocales: jsonb("target_locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'["es","fr","de"]'::jsonb`),
    canvaBrandId: text("canva_brand_id"),
    connectionTokenHash: text("connection_token_hash").notNull(),
    connectionTokenPrefix: text("connection_token_prefix").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("canva_connections_token_hash_key").on(table.connectionTokenHash),
    uniqueIndex("canva_connections_org_brand_key")
      .on(table.organizationId, table.canvaBrandId)
      .where(sql`${table.canvaBrandId} IS NOT NULL`),
    index("idx_canva_connections_org").on(table.organizationId),
    index("idx_canva_connections_api_key").on(table.apiKeyId),
    index("idx_canva_connections_project").on(table.projectId),
  ],
);

/**
 * One-time Canva connect claims. The Canva app creates a claim, the user
 * authorizes it in Hyperlocalise, and the app polls once for the connection token.
 */
export const canvaConnectionClaims = pgTable(
  "canva_connection_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pollTokenHash: text("poll_token_hash").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    connectionId: uuid("connection_id").references(() => canvaConnections.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    encryptionAlgorithm: text("encryption_algorithm"),
    ciphertext: text("ciphertext"),
    iv: text("iv"),
    authTag: text("auth_tag"),
    keyVersion: integer("key_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("canva_connection_claims_poll_token_hash_key").on(table.pollTokenHash),
    index("idx_canva_connection_claims_org").on(table.organizationId),
    index("idx_canva_connection_claims_expires").on(table.expiresAt),
  ],
);
