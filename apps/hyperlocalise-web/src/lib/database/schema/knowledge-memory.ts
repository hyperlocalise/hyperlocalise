import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";

/**
 * Stores one short workspace-level memory note that translation agents can use as durable context.
 */
export const knowledgeMemories = pgTable(
  "knowledge_memories",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
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
    check("knowledge_memories_content_length_check", sql`char_length(${table.content}) <= 2048`),
  ],
);
