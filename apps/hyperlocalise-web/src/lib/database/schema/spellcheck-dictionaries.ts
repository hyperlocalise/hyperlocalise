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
 * Organization-level spellcheck allow-list libraries. Words suppress Hunspell
 * false positives; they are not glossary terminology.
 */
export const spellcheckDictionaries = pgTable(
  "spellcheck_dictionaries",
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
    uniqueIndex("spellcheck_dictionaries_id_organization_id_key").on(
      table.id,
      table.organizationId,
    ),
    index("idx_spellcheck_dictionaries_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_spellcheck_dictionaries_created_by_user_id").on(table.createdByUserId),
  ],
);

/**
 * Locale-scoped accepted tokens inside a spellcheck dictionary library.
 */
export const spellcheckDictionaryWords = pgTable(
  "spellcheck_dictionary_words",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dictionaryId: uuid("dictionary_id")
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
    uniqueIndex("spellcheck_dictionary_words_dictionary_locale_word_key").on(
      table.dictionaryId,
      table.locale,
      table.wordNormalized,
    ),
    index("idx_spellcheck_dictionary_words_dictionary_locale").on(table.dictionaryId, table.locale),
  ],
);

/**
 * Attaches spellcheck dictionary libraries to projects with priority ordering.
 * Lower priority values win when the same normalized word appears twice.
 */
export const projectSpellcheckDictionaries = pgTable(
  "project_spellcheck_dictionaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    dictionaryId: uuid("dictionary_id")
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
    uniqueIndex("project_spellcheck_dictionaries_project_dictionary_key").on(
      table.projectId,
      table.dictionaryId,
    ),
    index("idx_project_spellcheck_dictionaries_org").on(table.organizationId),
    index("idx_project_spellcheck_dictionaries_project_priority").on(
      table.projectId,
      table.priority,
    ),
  ],
);
