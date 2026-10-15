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
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizationApiKeys } from "./integrations";
import { organizations, users } from "./organizations";

/**
 * Stores per-organization Figma plugin connections bound to an API key.
 * Designers pick a native project in the Figma plugin per request.
 * The plugin authenticates with an OAuth access token or a localhost connection token.
 */
export const figmaConnections = pgTable(
  "figma_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    apiKeyId: uuid("api_key_id")
      .notNull()
      .references(() => organizationApiKeys.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
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
    uniqueIndex("figma_connections_token_hash_key").on(table.connectionTokenHash),
    index("idx_figma_connections_org").on(table.organizationId),
    index("idx_figma_connections_api_key").on(table.apiKeyId),
  ],
);

/**
 * Short-lived Figma OAuth authorization codes. The plugin exchanges the code for
 * access and refresh tokens after the user consents in Hyperlocalise.
 */
export const figmaOauthAuthorizationCodes = pgTable(
  "figma_oauth_authorization_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codeHash: text("code_hash").notNull(),
    clientId: text("client_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => figmaConnections.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("figma_oauth_authorization_codes_code_hash_key").on(table.codeHash),
    index("idx_figma_oauth_authorization_codes_expires").on(table.expiresAt),
    index("idx_figma_oauth_authorization_codes_connection").on(table.connectionId),
  ],
);

/**
 * Figma OAuth access and refresh tokens bound to a Hyperlocalise connection.
 */
export const figmaOauthTokens = pgTable(
  "figma_oauth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => figmaConnections.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("figma_oauth_tokens_access_token_hash_key").on(table.accessTokenHash),
    uniqueIndex("figma_oauth_tokens_refresh_token_hash_key").on(table.refreshTokenHash),
    index("idx_figma_oauth_tokens_connection").on(table.connectionId),
    index("idx_figma_oauth_tokens_org").on(table.organizationId),
  ],
);

/**
 * Server-side OAuth handoff for the Figma plugin (null-origin iframe / external browser).
 */
export const figmaOauthHandoffs = pgTable(
  "figma_oauth_handoffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    readKeyHash: text("read_key_hash").notNull(),
    writeKeyHash: text("write_key_hash").notNull(),
    code: text("code"),
    error: text("error"),
    errorDescription: text("error_description"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("figma_oauth_handoffs_read_key_hash_key").on(table.readKeyHash),
    uniqueIndex("figma_oauth_handoffs_write_key_hash_key").on(table.writeKeyHash),
    index("idx_figma_oauth_handoffs_expires").on(table.expiresAt),
  ],
);
