import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { projectTranslationProvenanceEnum, projectTranslationStatusEnum } from "./enums";
import { repositorySourceFileVersions, repositorySourceFiles } from "./files";
import { jobs } from "./jobs";
import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Stores source translation keys for native projects, optionally scoped to a repository file.
 */
export const projectTranslationKeys = pgTable(
  "project_translation_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    repositorySourceFileId: uuid("repository_source_file_id").references(
      () => repositorySourceFiles.id,
      { onDelete: "cascade" },
    ),
    key: text("key").notNull(),
    sourceText: text("source_text").notNull(),
    normalizedSourceText: text("normalized_source_text").notNull(),
    context: text("context"),
    type: text("type"),
    maxLength: integer("max_length"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    sourceFileVersionId: uuid("source_file_version_id").references(
      () => repositorySourceFileVersions.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_translation_keys_project_file_key").on(
      table.projectId,
      table.repositorySourceFileId,
      table.key,
    ),
    index("idx_project_translation_keys_org_project").on(table.organizationId, table.projectId),
    index("idx_project_translation_keys_file").on(table.repositorySourceFileId),
  ],
);

/**
 * Stores per-locale translations for native project keys with review workflow state.
 */
export const projectTranslations = pgTable(
  "project_translations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    translationKeyId: uuid("translation_key_id")
      .notNull()
      .references(() => projectTranslationKeys.id, { onDelete: "cascade" }),
    targetLocale: text("target_locale").notNull(),
    text: text("text").notNull().default(""),
    status: projectTranslationStatusEnum("status").notNull().default("draft"),
    provenance: projectTranslationProvenanceEnum("provenance").notNull().default("manual"),
    sourceJobId: text("source_job_id").references(() => jobs.id, { onDelete: "set null" }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_translations_key_locale").on(table.translationKeyId, table.targetLocale),
    index("idx_project_translations_org_project").on(table.organizationId, table.projectId),
    index("idx_project_translations_status").on(table.projectId, table.status),
  ],
);
