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
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

/**
 * Per-user Braze REST cluster for a workspace.
 * The API key lives in WorkOS Pipes. This table stores only the allowlisted
 * instance key (for example `iad-03`).
 */
export const brazeConnectionSettings = pgTable(
  "braze_connection_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workosUserId: text("workos_user_id").notNull(),
    /** Allowlisted Braze REST cluster key, for example `iad-03`. */
    restEndpoint: text("rest_endpoint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("braze_connection_settings_org_user_key").on(
      table.organizationId,
      table.workosUserId,
    ),
    index("idx_braze_connection_settings_org").on(table.organizationId),
  ],
);
