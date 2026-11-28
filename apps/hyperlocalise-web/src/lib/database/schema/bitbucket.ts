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
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";

/**
 * A workspace's connections to Bitbucket Cloud, shared by everyone in the workspace. Each holds
 * an API token: an Atlassian account's API token (sent with its email) or a workspace, project
 * or repository access token (sent alone). At most one is marked the default; with none marked,
 * the oldest is. A project sync names the one it uses.
 */
export const bitbucketConnections = pgTable(
  "bitbucket_connections",
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
    /** What people call it; the connected account's name when empty. */
    name: text("name"),
    isDefault: boolean("is_default").notNull().default(false),
    /** The Atlassian account email an API token is sent with; null for an access token. */
    accountEmail: text("account_email"),
    /** Who Bitbucket says the token belongs to; null when it wouldn't say. */
    connectedAccount: text("connected_account"),
    encryptionAlgorithm: text("encryption_algorithm").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    maskedTokenSuffix: text("masked_token_suffix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_bitbucket_connections_org").on(table.organizationId),
    uniqueIndex("bitbucket_connections_default_key")
      .on(table.organizationId)
      .where(sql`${table.isDefault}`),
  ],
);
