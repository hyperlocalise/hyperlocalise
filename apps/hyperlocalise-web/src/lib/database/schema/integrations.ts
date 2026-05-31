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

import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Stores generic organization connectors such as Slack with enabled state and provider-specific configuration. This supports lightweight integrations that do not need a dedicated table.
 */
export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("connectors_org_kind_key").on(table.organizationId, table.kind),
    index("idx_connectors_org").on(table.organizationId),
    index("idx_connectors_slack_team_id")
      .on(sql`(config->>'teamId')`)
      .where(sql`${table.kind} = 'slack'`),
  ],
);

/**
 * Stores legacy or generic links from organizations and projects to external TMS accounts or projects with provider-specific configuration metadata.
 */
export const tmsLinks = pgTable(
  "tms_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id"),
    externalProjectId: text("external_project_id"),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_tms_links_org").on(table.organizationId),
    index("idx_tms_links_org_provider").on(table.organizationId, table.provider),
  ],
);

/**
 * Stores hashed organization API keys, display prefixes, permissions, creator, revocation state, and last-used metadata for public API access.
 */
export const organizationApiKeys = pgTable(
  "organization_api_keys",
  {
    // Stable API key identifier.
    id: uuid("id").defaultRandom().primaryKey(),
    // Organization that owns this key.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Human-readable name for the key.
    name: text("name").notNull(),
    // SHA-256 hash of the API key secret used for lookup.
    keyHash: text("key_hash").notNull(),
    // First 8 characters of the key shown in UI lists.
    keyPrefix: text("key_prefix").notNull(),
    // Permissions granted to this key, e.g. ["jobs:read", "jobs:write", "files:read", "files:write"].
    permissions: jsonb("permissions")
      .$type<string[]>()
      .notNull()
      .default(sql`'["jobs:read", "jobs:write", "files:read", "files:write"]'::jsonb`),
    // User who created the key.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // When the key was last used successfully.
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    // When the key was revoked. Null means active.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // When the key record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the key record last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("organization_api_keys_key_hash_key").on(table.keyHash),
    index("idx_organization_api_keys_org").on(table.organizationId),
    index("idx_organization_api_keys_created_at").on(table.createdAt),
  ],
);

/**
 * Stores persisted MCP OAuth sessions, token hashes, encrypted WorkOS tokens, expiry times, and revocation state for MCP clients.
 */
export const mcpSessions = pgTable(
  "mcp_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("mcp"),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    workosAccessTokenEncrypted: text("workos_access_token_encrypted"),
    workosRefreshTokenEncrypted: text("workos_refresh_token_encrypted"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("mcp_sessions_access_token_hash_key").on(table.accessTokenHash),
    uniqueIndex("mcp_sessions_refresh_token_hash_key").on(table.refreshTokenHash),
    index("idx_mcp_sessions_user_id").on(table.userId),
    index("idx_mcp_sessions_organization_id").on(table.organizationId),
    index("idx_mcp_sessions_expires_at").on(table.expiresAt),
  ],
);

/**
 * Stores registered MCP OAuth client metadata, including redirect URIs, supported grant types, response types, scope, and timestamps.
 */
export const mcpOAuthClients = pgTable(
  "mcp_oauth_clients",
  {
    clientId: text("client_id").primaryKey(),
    clientName: text("client_name"),
    redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
    grantTypes: jsonb("grant_types")
      .$type<string[]>()
      .notNull()
      .default(["authorization_code", "refresh_token"]),
    responseTypes: jsonb("response_types").$type<string[]>().notNull().default(["code"]),
    scope: text("scope").notNull().default("mcp"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("idx_mcp_oauth_clients_created_at").on(table.createdAt)],
);

/**
 * Stores consumed OAuth authorization-code hashes until expiry so codes cannot be exchanged more than once.
 */
export const usedAuthorizationCodes = pgTable(
  "used_authorization_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_used_authorization_codes_expires_at").on(table.expiresAt)],
);
