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
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";
import { glossaryConcepts, glossaryTerms, glossaries } from "./translation-memory";

export type GlossaryHistoryChange = {
  field: string;
  before: unknown;
  after: unknown;
};

/** Durable, content-aware terminology history; intentionally separate from workspace activity. */
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
    // These are immutable audit identifiers, not live-row relationships. Keeping them
    // independent of the content tables preserves delete history after hard deletion.
    conceptId: uuid("concept_id"),
    termId: uuid("term_id"),
    eventType: text("event_type").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorCredentialId: text("actor_credential_id"),
    version: integer("version").notNull().default(1),
    reason: text("reason"),
    changedFields: jsonb("changed_fields").$type<string[]>().notNull().default([]),
    changes: jsonb("changes").$type<GlossaryHistoryChange[]>().notNull().default([]),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
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

/** Human-readable review discussion, kept with glossary history rather than infra logs. */
export const glossaryReviewComments = pgTable(
  "glossary_review_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    glossaryId: uuid("glossary_id")
      .notNull()
      .references(() => glossaries.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id").references(() => glossaryConcepts.id, { onDelete: "set null" }),
    termId: uuid("term_id").references(() => glossaryTerms.id, { onDelete: "set null" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_glossary_review_comments_concept_created_at").on(table.conceptId, table.createdAt),
    index("idx_glossary_review_comments_term_created_at").on(table.termId, table.createdAt),
  ],
);

/** Source-to-survivor links preserve merge/replace history and make restoration auditable. */
export const glossaryConceptRedirects = pgTable(
  "glossary_concept_redirects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    glossaryId: uuid("glossary_id")
      .notNull()
      .references(() => glossaries.id, { onDelete: "cascade" }),
    sourceConceptId: uuid("source_concept_id").references(() => glossaryConcepts.id, {
      onDelete: "set null",
    }),
    targetConceptId: uuid("target_concept_id").references(() => glossaryConcepts.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_glossary_concept_redirects_source").on(table.sourceConceptId),
    index("idx_glossary_concept_redirects_target").on(table.targetConceptId),
  ],
);
