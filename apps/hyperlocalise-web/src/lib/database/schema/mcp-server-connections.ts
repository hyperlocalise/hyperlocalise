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
 * Org-level remote MCP server connections.
 * Secrets (bearer tokens / custom headers) are AES-256-GCM encrypted.
 * Automations reference a connection via toolConfig.mcp.connectionId.
 */
export const mcpServerConnections = pgTable(
  "mcp_server_connections",
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
    serverUrl: text("server_url").notNull(),
    transport: text("transport").notNull().default("http"),
    authKind: text("auth_kind").notNull().default("none"),
    enabled: boolean("enabled").notNull().default(true),
    validationStatus: text("validation_status").notNull().default("unvalidated"),
    validationMessage: text("validation_message"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
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
    uniqueIndex("mcp_server_connections_org_url_key").on(table.organizationId, table.serverUrl),
    index("idx_mcp_server_connections_org").on(table.organizationId),
  ],
);
