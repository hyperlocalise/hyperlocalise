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
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { assetStatusEnum } from "./enums";
import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Spellcheck custom dictionary storage.
 *
 * Legacy migration `0124_premium_cerise` introduced `spellcheck_dictionaries`,
 * `spellcheck_dictionary_words`, and `project_spellcheck_dictionaries`, but
 * those tables were often never created in production: Drizzle applies migrations
 * only when the journal `when` timestamp is greater than the latest row in
 * `drizzle.__drizzle_migrations`, and `0124`'s `when` was lower than `0123`'s
 * while `0125` still ran afterward. Do not use the legacy table names; runtime
 * code and new migrations target the `spellcheck_word_*` tables below.
 */
export const spellcheckDictionaries = pgTable(
  "spellcheck_word_libraries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: assetStatusEnum("status").notNull().default("active"),
    wordsVersion: integer("words_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("spellcheck_word_libraries_id_organization_id_key").on(table.id, table.organizationId),
    index("idx_spellcheck_word_libraries_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_spellcheck_word_libraries_created_by_user_id").on(table.createdByUserId),
  ],
);

/**
 * Locale-scoped accepted tokens inside a spellcheck word library.
 */
export const spellcheckDictionaryWords = pgTable(
  "spellcheck_word_library_words",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dictionaryId: uuid("library_id")
      .notNull()
      .references(() => spellcheckDictionaries.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    word: text("word").notNull(),
    wordNormalized: text("word_normalized").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("spellcheck_word_library_words_library_locale_word_key").on(
      table.dictionaryId,
      table.locale,
      table.wordNormalized,
    ),
    index("idx_spellcheck_word_library_words_library_locale").on(table.dictionaryId, table.locale),
  ],
);

/**
 * Attaches spellcheck word libraries to projects with priority ordering.
 * Lower priority values win when the same normalized word appears twice.
 */
export const projectSpellcheckDictionaries = pgTable(
  "project_spellcheck_word_libraries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    dictionaryId: uuid("library_id")
      .notNull()
      .references(() => spellcheckDictionaries.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_spellcheck_word_libraries_project_library_key").on(
      table.projectId,
      table.dictionaryId,
    ),
    index("idx_project_spellcheck_word_libraries_org").on(table.organizationId),
    index("idx_project_spellcheck_word_libraries_project_priority").on(
      table.projectId,
      table.priority,
    ),
  ],
);
