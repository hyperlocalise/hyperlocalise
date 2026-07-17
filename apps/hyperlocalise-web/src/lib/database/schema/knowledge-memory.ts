import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";

/**
 * Stores one organization-level markdown memory note for localization guidance.
 */
export const knowledgeMemories = pgTable(
  "knowledge_memories",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id").notNull().defaultRandom(),
    version: integer("version").notNull().default(1),
    content: text("content").notNull().default(""),
    summary: text("summary").notNull().default("Initial version"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("knowledge_memories_revision_id_key").on(table.revisionId),
    check("knowledge_memories_content_length_check", sql`char_length(${table.content}) <= 50000`),
    check("knowledge_memories_summary_length_check", sql`char_length(${table.summary}) <= 160`),
    check("knowledge_memories_version_check", sql`${table.version} >= 1`),
  ],
);

/**
 * Stores immutable snapshots after an organization memory revision is superseded.
 */
export const knowledgeMemoryRevisions = pgTable(
  "knowledge_memory_revisions",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    summary: text("summary").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_memory_revisions_org_version_key").on(
      table.organizationId,
      table.version,
    ),
    check(
      "knowledge_memory_revisions_content_length_check",
      sql`char_length(${table.content}) <= 50000`,
    ),
    check(
      "knowledge_memory_revisions_summary_length_check",
      sql`char_length(${table.summary}) <= 160`,
    ),
    check("knowledge_memory_revisions_version_check", sql`${table.version} >= 1`),
  ],
);
