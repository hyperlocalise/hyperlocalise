import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { externalTmsProviderKindEnum, jobAssigneeRoleEnum, projectSourceEnum } from "./enums";
import { organizations, teams, users } from "./organizations";
import { organizationExternalTmsProviderCredentials } from "./providers";

/**
 * Stores localization projects, whether native or external-TMS-backed. Projects carry translation context, locale metadata, provider links, and ownership information used by jobs and assets.
 */
export const projects = pgTable(
  "projects",
  {
    // Stable project identifier used by jobs and future translation assets.
    id: text("id").primaryKey(),
    // Tenant that owns this project, stored as an internal organization ID.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Team that owns this project for membership-scoped access.
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "restrict" }),
    // User who created the project, stored as an internal user ID.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // User who last updated project metadata, stored as an internal user ID.
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Human-readable project name shown in app lists and settings.
    name: text("name").notNull(),
    // Optional long-form description for operator context.
    description: text("description").notNull().default(""),
    // Shared project-level translation guidance injected into job execution.
    translationContext: text("translation_context").notNull().default(""),
    // Where this project originated from.
    source: projectSourceEnum("source").notNull().default("native"),
    // Provider kind when sourced from external TMS.
    externalProviderKind: externalTmsProviderKindEnum("external_provider_kind"),
    // External provider credential backing this project.
    externalProviderCredentialId: uuid("external_provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "set null" },
    ),
    // Stable project ID from the external TMS provider.
    externalProjectId: text("external_project_id"),
    // Source locale from provider metadata.
    sourceLocale: text("source_locale"),
    // Target locales from provider metadata.
    targetLocales: jsonb("target_locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Optional direct project URL in provider UI.
    externalProjectUrl: text("external_project_url"),
    // Whether provider reports this project as active.
    isActive: boolean("is_active").notNull().default(true),
    // Last successful sync timestamp.
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    // Last sync failure timestamp and message.
    lastSyncErrorAt: timestamp("last_sync_error_at", { withTimezone: true }),
    lastSyncErrorMessage: text("last_sync_error_message"),
    // Raw provider metadata for debugging and forward compatibility.
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // When the project record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When project metadata was last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("projects_id_organization_id_key").on(table.id, table.organizationId),
    uniqueIndex("projects_org_provider_external_project_key").on(
      table.organizationId,
      table.externalProviderKind,
      table.externalProjectId,
    ),
    index("idx_projects_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_projects_team_id").on(table.teamId),
    index("idx_projects_created_by_user_id").on(table.createdByUserId),
  ],
);

/**
 * Default translator or reviewer assignments per project locale.
 */
export const projectLocaleAssignments = pgTable(
  "project_locale_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    role: jobAssigneeRoleEnum("role").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_locale_assignments_project_locale_role_key").on(
      table.projectId,
      table.locale,
      table.role,
    ),
    index("idx_project_locale_assignments_org_project").on(table.organizationId, table.projectId),
    index("idx_project_locale_assignments_user_id").on(table.userId),
  ],
);
