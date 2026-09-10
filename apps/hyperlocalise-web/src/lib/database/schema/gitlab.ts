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
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";

/**
 * Org-level self-hosted GitLab connections.
 * GitLab.com stays on WorkOS Pipes. Automations and chat clone against
 * `baseUrl` with an encrypted personal access token.
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
    displayName: text("display_name").notNull(),
    baseUrl: text("base_url").notNull(),
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
  (table) => [
    index("idx_gitlab_connections_org").on(table.organizationId),
    uniqueIndex("idx_gitlab_connections_org_base_url").on(table.organizationId, table.baseUrl),
  ],
);
