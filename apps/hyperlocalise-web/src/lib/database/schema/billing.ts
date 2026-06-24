import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

/**
 * Tracks the last successful Autumn projection for workspace resource usage.
 * Local database counts remain the source of truth; this table prevents
 * best-effort Autumn delta syncs from double-applying across retries.
 */
export const workspaceResourceUsageSyncStates = pgTable(
  "workspace_resource_usage_sync_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    featureId: text("feature_id").notNull(),
    syncedUsage: integer("synced_usage").notNull().default(0),
    syncSequence: integer("sync_sequence").notNull().default(0),
    status: text("status").notNull().default("pending"),
    lastSyncError: text("last_sync_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("workspace_resource_usage_sync_states_org_feature_key").on(
      table.organizationId,
      table.featureId,
    ),
    index("idx_workspace_resource_usage_sync_states_org").on(table.organizationId),
  ],
);
