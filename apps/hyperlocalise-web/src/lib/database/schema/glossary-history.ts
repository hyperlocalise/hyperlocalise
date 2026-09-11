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
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";
import { glossaries } from "./translation-memory";

export type GlossaryHistoryChange = {
  field: string;
  before: unknown;
  after: unknown;
};

/** Append-only glossary history for durable, content-aware audit events. */
export const glossaryHistoryEvents = pgTable(
  "glossary_history_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    glossaryId: uuid("glossary_id")
      .notNull()
      .references(() => glossaries.id, { onDelete: "cascade" }),
    // Immutable audit identifiers. They intentionally do not reference live rows so history
    // can survive future concept or term deletion.
    conceptId: uuid("concept_id"),
    termId: uuid("term_id"),
    eventType: text("event_type").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorCredentialId: text("actor_credential_id"),
    version: integer("version").notNull().default(1),
    reason: text("reason"),
    changedFields: jsonb("changed_fields")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    changes: jsonb("changes")
      .$type<GlossaryHistoryChange[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    attributes: jsonb("attributes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_glossary_history_events_glossary_occurred_at_id").on(
      table.glossaryId,
      table.occurredAt,
      table.id,
    ),
    index("idx_glossary_history_events_concept_occurred_at").on(table.conceptId, table.occurredAt),
    index("idx_glossary_history_events_term_occurred_at").on(table.termId, table.occurredAt),
  ],
);
