import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";

/**
 * OAuth sessions issued to the Canva app after a Hyperlocalise user signs in.
 * Tokens are user-scoped; org and project are chosen per request in the Canva iframe.
 */
export const canvaOauthSessions = pgTable(
  "canva_oauth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("canva.localize offline_access"),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    canvaBrandId: text("canva_brand_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("canva_oauth_sessions_access_token_hash_key").on(table.accessTokenHash),
    uniqueIndex("canva_oauth_sessions_refresh_token_hash_key").on(table.refreshTokenHash),
    index("idx_canva_oauth_sessions_user_id").on(table.userId),
    index("idx_canva_oauth_sessions_expires_at").on(table.expiresAt),
  ],
);

/**
 * Optional default workspace mapping for a Canva brand (team).
 */
export const canvaBrandOrgBindings = pgTable(
  "canva_brand_org_bindings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canvaBrandId: text("canva_brand_id").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boundByUserId: uuid("bound_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("canva_brand_org_bindings_brand_key").on(table.canvaBrandId),
    index("idx_canva_brand_org_bindings_org").on(table.organizationId),
  ],
);
