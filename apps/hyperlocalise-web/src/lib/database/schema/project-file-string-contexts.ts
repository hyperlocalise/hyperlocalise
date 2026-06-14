import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Caches repository-agent context lookups for CAT segments so translators do not rerun expensive investigations.
 */
export const projectFileStringRepositoryContexts = pgTable(
  "project_file_string_repository_contexts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    stringKey: text("string_key").notNull(),
    repositoryFullName: text("repository_full_name").notNull(),
    sourceTextHash: text("source_text_hash").notNull(),
    summary: text("summary").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_file_string_repository_contexts_lookup").on(
      table.organizationId,
      table.projectId,
      table.sourcePath,
      table.stringKey,
      table.repositoryFullName,
    ),
    index("idx_project_file_string_repository_contexts_file").on(
      table.organizationId,
      table.projectId,
      table.sourcePath,
    ),
    check(
      "project_file_string_repository_contexts_summary_length_check",
      sql`char_length(${table.summary}) <= 16384`,
    ),
  ],
);
