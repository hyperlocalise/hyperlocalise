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
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";

/**
 * Org-level Google Search Console OAuth connections.
 * Domains research mints an access token per request and calls go-svc.
 */
export const gscConnections = pgTable(
  "gsc_connections",
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
    googleSubject: text("google_subject").notNull(),
    accountEmail: text("account_email").notNull(),
    scopes: text("scopes").notNull(),
    encryptionAlgorithm: text("encryption_algorithm").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    accessTokenEncryptionAlgorithm: text("access_token_encryption_algorithm"),
    accessTokenCiphertext: text("access_token_ciphertext"),
    accessTokenIv: text("access_token_iv"),
    accessTokenAuthTag: text("access_token_auth_tag"),
    accessTokenKeyVersion: integer("access_token_key_version"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("gsc_connections_org_key").on(table.organizationId),
    index("idx_gsc_connections_org").on(table.organizationId),
  ],
);
