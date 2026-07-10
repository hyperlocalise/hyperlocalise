import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";

/**
 * Persists CAT string overlays for external TMS projects (e.g. treat-as-image).
 * `project_id` is the API project id (`ext:crowdin:42`), matching string-context cache rows.
 * Scoped by `external_resource_id` so the same string id under different provider files
 * does not share image-mode state.
 */
export const projectCatStringOverlays = pgTable(
  "project_cat_string_overlays",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull(),
    sourcePath: text("source_path").notNull(),
    externalResourceId: text("external_resource_id").notNull(),
    externalStringId: text("external_string_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
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
    uniqueIndex("project_cat_string_overlays_lookup").on(
      table.organizationId,
      table.projectId,
      table.sourcePath,
      table.externalResourceId,
      table.externalStringId,
    ),
    index("idx_project_cat_string_overlays_file").on(
      table.organizationId,
      table.projectId,
      table.sourcePath,
      table.externalResourceId,
    ),
  ],
);
