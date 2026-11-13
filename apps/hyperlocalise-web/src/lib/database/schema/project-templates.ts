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
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, teams, users } from "./organizations";
import { glossaries, memories } from "./translation-memory";

/**
 * A saved starting point for new native projects: locales, translation context, team, the
 * translation memories and glossaries to attach, and the content editor settings. Creating a
 * project from a template copies these values; later template edits do not touch the project.
 */
export const projectTemplates = pgTable(
  "project_templates",
  {
    // Stable template identifier.
    id: uuid("id").defaultRandom().primaryKey(),
    // Workspace that owns the template.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Who created the template.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Who last changed the template.
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Name shown in the template list and the New project dialog.
    name: text("name").notNull(),
    // What the template is for.
    description: text("description").notNull().default(""),
    // Source locale for projects created from the template.
    sourceLocale: text("source_locale").notNull(),
    // Target locales for projects created from the template.
    targetLocales: jsonb("target_locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Description copied to each new project.
    projectDescription: text("project_description").notNull().default(""),
    // Translation context copied to each new project.
    translationContext: text("translation_context").notNull().default(""),
    // Team new projects belong to. Null uses the creator's first team, as project creation does.
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    // Content editor settings copied to each new project.
    automaticallyGroupIdenticalStrings: boolean("automatically_group_identical_strings")
      .notNull()
      .default(false),
    sourceTextEditable: boolean("source_text_editable").notNull().default(false),
    approvedTranslationsOnSourceChange: text("approved_translations_on_source_change", {
      enum: ["stay_approved", "needs_review"],
    })
      .notNull()
      .default("stay_approved"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_templates_organization_id_name_key").on(table.organizationId, table.name),
    index("idx_project_templates_team_id").on(table.teamId),
    check(
      "project_templates_approved_translations_on_source_change_check",
      sql`${table.approvedTranslationsOnSourceChange} in ('stay_approved', 'needs_review')`,
    ),
  ],
);

/** Translation memories a template attaches to each new project, in priority order. */
export const projectTemplateMemories = pgTable(
  "project_template_memories",
  {
    templateId: uuid("template_id")
      .notNull()
      .references(() => projectTemplates.id, { onDelete: "cascade" }),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    // Lower values are searched first, as on project_memories.
    priority: integer("priority").notNull().default(0),
  },
  (table) => [
    uniqueIndex("project_template_memories_template_memory_key").on(
      table.templateId,
      table.memoryId,
    ),
    index("idx_project_template_memories_memory_id").on(table.memoryId),
  ],
);

/** Glossaries a template attaches to each new project, in priority order. */
export const projectTemplateGlossaries = pgTable(
  "project_template_glossaries",
  {
    templateId: uuid("template_id")
      .notNull()
      .references(() => projectTemplates.id, { onDelete: "cascade" }),
    glossaryId: uuid("glossary_id")
      .notNull()
      .references(() => glossaries.id, { onDelete: "cascade" }),
    // Lower values load first, as on project_glossaries.
    priority: integer("priority").notNull().default(0),
  },
  (table) => [
    uniqueIndex("project_template_glossaries_template_glossary_key").on(
      table.templateId,
      table.glossaryId,
    ),
    index("idx_project_template_glossaries_glossary_id").on(table.glossaryId),
  ],
);
