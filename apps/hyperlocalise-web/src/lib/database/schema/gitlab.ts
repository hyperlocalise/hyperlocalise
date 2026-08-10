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

import { bigintText } from "./core";
import { organizations, users } from "./organizations";

/**
 * Stores the GitLab OAuth connection for an organization, including account
 * metadata and encrypted access/refresh token material used for API calls and
 * sandbox git clones.
 */
export const gitlabConnections = pgTable(
  "gitlab_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** GitLab instance base URL (e.g. https://gitlab.com). */
    baseUrl: text("base_url").notNull().default("https://gitlab.com"),
    gitlabUserId: bigintText("gitlab_user_id").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    /** When the encrypted OAuth access token expires. */
    oauthExpiresAt: timestamp("oauth_expires_at", { withTimezone: true }),
    encryptionAlgorithm: text("encryption_algorithm").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("gitlab_connections_organization_id_key").on(table.organizationId),
    uniqueIndex("gitlab_connections_base_url_gitlab_user_id_key").on(
      table.baseUrl,
      table.gitlabUserId,
    ),
    index("idx_gitlab_connections_created_at").on(table.createdAt),
  ],
);

/**
 * Stores short-lived GitLab OAuth state nonces so authorize callbacks can be
 * verified, scoped to the initiating organization and user, and consumed once.
 */
export const gitlabConnectionStates = pgTable(
  "gitlab_connection_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nonce: text("nonce").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("gitlab_connection_states_nonce_key").on(table.nonce),
    index("idx_gitlab_connection_states_org_user").on(table.organizationId, table.userId),
    index("idx_gitlab_connection_states_expires_at").on(table.expiresAt),
  ],
);

/**
 * Stores GitLab projects visible through an organization connection, including
 * identifiers, path, default branch, enabled state, and sync timestamps.
 */
export const gitlabProjects = pgTable(
  "gitlab_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    gitlabConnectionId: uuid("gitlab_connection_id")
      .notNull()
      .references(() => gitlabConnections.id, { onDelete: "cascade" }),
    gitlabProjectId: bigintText("gitlab_project_id").notNull(),
    name: text("name").notNull(),
    pathWithNamespace: text("path_with_namespace").notNull(),
    httpUrlToRepo: text("http_url_to_repo").notNull(),
    private: boolean("private").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    defaultBranch: text("default_branch"),
    enabled: boolean("enabled").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("gitlab_projects_connection_project_id_key").on(
      table.gitlabConnectionId,
      table.gitlabProjectId,
    ),
    index("idx_gitlab_projects_org").on(table.organizationId),
    index("idx_gitlab_projects_connection").on(table.gitlabConnectionId),
    index("idx_gitlab_projects_org_enabled").on(table.organizationId, table.enabled),
  ],
);
