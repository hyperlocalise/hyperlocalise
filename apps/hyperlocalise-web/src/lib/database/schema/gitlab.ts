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
 * A workspace's connections to GitLab servers, shared by everyone in the workspace. At most one
 * is marked the default; with none marked, the oldest is. The default serves chat and
 * automations; a project sync names the one it uses.
 */
export const gitlabConnections = pgTable(
  "gitlab_connections",
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
    /** What people call it; the server's host when empty (connections made before names). */
    name: text("name"),
    isDefault: boolean("is_default").notNull().default(false),
    serverUrl: text("server_url").notNull(),
    connectedUsername: text("connected_username").notNull(),
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
    index("idx_gitlab_connections_org").on(table.organizationId),
    uniqueIndex("gitlab_connections_default_key")
      .on(table.organizationId)
      .where(sql`${table.isDefault}`),
  ],
);
