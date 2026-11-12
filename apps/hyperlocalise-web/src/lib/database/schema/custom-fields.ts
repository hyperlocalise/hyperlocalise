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
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";
import { projects } from "./projects";

export const customFieldTypes = [
  "text",
  "number",
  "date",
  "url",
  "checkbox",
  "single_select",
  "multi_select",
] as const;

/**
 * A workspace-defined project field, such as a request reference or a list of markets. Select
 * fields offer a fixed list of options in `custom_field_options`.
 */
export const customFields = pgTable(
  "custom_fields",
  {
    // Stable field identifier.
    id: uuid("id").defaultRandom().primaryKey(),
    // Workspace that owns the field.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Machine name used in API requests, unique in the workspace (lowercase letters, digits, _).
    key: text("key").notNull(),
    // Label shown to people.
    name: text("name").notNull(),
    // What the field is for.
    description: text("description").notNull().default(""),
    // Kind of value the field holds. It cannot change once the field exists.
    type: text("type", { enum: customFieldTypes }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
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
    uniqueIndex("custom_fields_organization_id_key_key").on(table.organizationId, table.key),
    check(
      "custom_fields_type_check",
      sql`${table.type} in ('text', 'number', 'date', 'url', 'checkbox', 'single_select', 'multi_select')`,
    ),
  ],
);

/** One choice of a single- or multi-select custom field, in display order. */
export const customFieldOptions = pgTable(
  "custom_field_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    // Option text, unique in the field.
    value: text("value").notNull(),
    // Lower values are listed first.
    position: integer("position").notNull().default(0),
  },
  (table) => [
    uniqueIndex("custom_field_options_field_id_value_key").on(table.fieldId, table.value),
  ],
);

/**
 * A project's value for one custom field. Text, URL and date values are JSON strings, numbers
 * are JSON numbers, checkboxes are booleans, a single select is an option ID and a multi select
 * is an array of option IDs.
 */
export const projectCustomFieldValues = pgTable(
  "project_custom_field_values",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    value: jsonb("value").notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    primaryKey({
      name: "project_custom_field_values_pkey",
      columns: [table.projectId, table.fieldId],
    }),
    index("idx_project_custom_field_values_field_id").on(table.fieldId),
  ],
);
