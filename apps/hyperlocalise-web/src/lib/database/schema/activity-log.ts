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
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type {
  ActivityActorKind,
  ActivityEventType,
  ActivityTargetKind,
} from "@/lib/activity-log/activity-log-contract";

import { organizations, users } from "./organizations";

/**
 * Append-only organization activity events. Product code writes through the
 * activity-log writer so payload validation and best-effort error handling stay
 * consistent across instrumentation paths.
 */
export const organizationActivityEvents = pgTable(
  "organization_activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorKind: text("actor_kind").$type<ActivityActorKind>().notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorCredentialId: text("actor_credential_id"),
    eventType: text("event_type").$type<ActivityEventType>().notNull(),
    targetKind: text("target_kind").$type<ActivityTargetKind>().notNull(),
    targetId: text("target_id").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    index("idx_organization_activity_events_org_created_at_id").on(
      table.organizationId,
      table.createdAt,
      table.id,
    ),
  ],
);
