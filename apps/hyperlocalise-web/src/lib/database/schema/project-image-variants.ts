import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { projectTranslationProvenanceEnum, projectTranslationStatusEnum } from "./enums";
import { externalTmsFiles, repositorySourceFiles, storedFiles } from "./files";
import { jobs } from "./jobs";
import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Stores per-locale localized image variants for file-backed image sources.
 */
export const projectImageVariants = pgTable(
  "project_image_variants",
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
    externalTmsFileId: uuid("external_tms_file_id").references(() => externalTmsFiles.id, {
      onDelete: "cascade",
    }),
    sourcePath: text("source_path").notNull(),
    targetLocale: text("target_locale").notNull(),
    storedFileId: text("stored_file_id").references(() => storedFiles.id, {
      onDelete: "set null",
    }),
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
    uniqueIndex("project_image_variants_project_path_locale").on(
      table.projectId,
      table.sourcePath,
      table.targetLocale,
    ),
    index("idx_project_image_variants_org_project").on(table.organizationId, table.projectId),
    index("idx_project_image_variants_repo_file").on(table.repositorySourceFileId),
    index("idx_project_image_variants_external_file").on(table.externalTmsFileId),
    index("idx_project_image_variants_status").on(table.projectId, table.status),
  ],
);
