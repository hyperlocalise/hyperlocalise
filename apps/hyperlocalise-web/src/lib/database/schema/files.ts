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

import {
  externalTmsProviderKindEnum,
  externalTmsResourceTypeEnum,
  repositorySourceFileIngestStateEnum,
  storedFileRoleEnum,
  storedFileSourceKindEnum,
} from "./enums";
import { organizations, users } from "./organizations";
import { organizationExternalTmsProviderCredentials } from "./providers";
import { projects } from "./projects";
import { interactions } from "./agents";
import { jobs } from "./jobs";
import { organizationApiKeys } from "./integrations";

/**
 * Stores metadata for files kept in object storage, including tenant/project scope, source provenance, role, storage location, content metadata, hashes, and audit timestamps.
 */
export const storedFiles = pgTable(
  "stored_files",
  {
    // Stable file identifier used by jobs and interaction attachments.
    id: text("id").primaryKey(),
    // Tenant that owns this file.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Optional project scope. Null means the file is workspace-level.
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    // User who uploaded or generated the file, if known.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // How this file is used in the product.
    role: storedFileRoleEnum("role").notNull(),
    // Where the file came from.
    sourceKind: storedFileSourceKindEnum("source_kind").notNull(),
    // Interaction that introduced the file, if any.
    sourceInteractionId: uuid("source_interaction_id").references(() => interactions.id, {
      onDelete: "set null",
    }),
    // Job that produced the file, if any.
    sourceJobId: text("source_job_id").references(() => jobs.id, { onDelete: "set null" }),
    // Object storage implementation that owns the bytes.
    storageProvider: text("storage_provider").notNull(),
    // Provider-specific object key or pathname.
    storageKey: text("storage_key").notNull(),
    // Provider URL retained for server-side retrieval and diagnostics.
    storageUrl: text("storage_url").notNull(),
    // Download URL when the provider returns one.
    downloadUrl: text("download_url"),
    // Original or generated filename shown to users.
    filename: text("filename").notNull(),
    // MIME type captured at storage time.
    contentType: text("content_type").notNull(),
    // File size in bytes.
    byteSize: integer("byte_size").notNull(),
    // SHA-256 of the stored bytes for dedupe and audit checks.
    sha256: text("sha256").notNull(),
    // Provider entity tag, when available.
    etag: text("etag"),
    // Extensible provenance or adapter metadata.
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // When the file metadata record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the file metadata last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("stored_files_storage_provider_key").on(table.storageProvider, table.storageKey),
    index("idx_stored_files_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_stored_files_project_created_at").on(table.projectId, table.createdAt),
    index("idx_stored_files_created_by_user_id").on(table.createdByUserId),
    index("idx_stored_files_source_interaction").on(table.sourceInteractionId),
    index("idx_stored_files_source_job").on(table.sourceJobId),
    index("idx_stored_files_org_role").on(table.organizationId, table.role),
  ],
);

/**
 * Stores source file paths tracked for repository-backed projects. Each row represents the stable file identity within a project.
 */
export const repositorySourceFiles = pgTable(
  "repository_source_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("repository_source_files_project_path_key").on(table.projectId, table.sourcePath),
    index("idx_repository_source_files_org_project").on(table.organizationId, table.projectId),
  ],
);

/**
 * Stores uploaded or generated versions of repository source files, linking tracked paths to stored file bytes, commits, upload actors, and workflow runs.
 */
export const repositorySourceFileVersions = pgTable(
  "repository_source_file_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositorySourceFileId: uuid("repository_source_file_id")
      .notNull()
      .references(() => repositorySourceFiles.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    storedFileId: text("stored_file_id")
      .notNull()
      .references(() => storedFiles.id, { onDelete: "cascade" }),
    sourceHash: text("source_hash"),
    commitSha: text("commit_sha"),
    workflowRunId: text("workflow_run_id"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    uploadedByApiKeyId: uuid("uploaded_by_api_key_id").references(() => organizationApiKeys.id, {
      onDelete: "set null",
    }),
    uploadSurface: text("upload_surface"),
    ingestState: repositorySourceFileIngestStateEnum("ingest_state").notNull().default("pending"),
    ingestError: text("ingest_error"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }),
    ingestWorkflowRunId: text("ingest_workflow_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("repository_source_file_versions_stored_file_key").on(table.storedFileId),
    index("idx_repository_source_file_versions_file_created").on(
      table.repositorySourceFileId,
      table.createdAt,
    ),
    index("idx_repository_source_file_versions_project_path_created").on(
      table.projectId,
      table.sourcePath,
      table.createdAt,
    ),
    index("idx_repository_source_file_versions_workflow_run").on(table.workflowRunId),
    index("idx_repository_source_file_versions_api_key").on(table.uploadedByApiKeyId),
    index("idx_repository_source_file_versions_ingest_state").on(
      table.projectId,
      table.ingestState,
    ),
  ],
);

/**
 * Stores provider-backed file or key resources discovered from external TMS projects, including provider identifiers, source path, locale readiness, linked stored file, and sync metadata.
 */
export const externalTmsFiles = pgTable(
  "external_tms_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    providerCredentialId: uuid("provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "set null" },
    ),
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    externalProjectId: text("external_project_id").notNull(),
    resourceType: externalTmsResourceTypeEnum("resource_type").notNull(),
    externalResourceId: text("external_resource_id").notNull(),
    sourcePath: text("source_path").notNull(),
    displayName: text("display_name").notNull(),
    format: text("format"),
    sourceLocale: text("source_locale"),
    targetLocales: jsonb("target_locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sourceHash: text("source_hash"),
    revision: text("revision"),
    storedFileId: text("stored_file_id").references(() => storedFiles.id, {
      onDelete: "set null",
    }),
    externalUrl: text("external_url"),
    syncState: text("sync_state").notNull().default("pending"),
    localeReadiness: jsonb("locale_readiness")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    providerPayload: jsonb("provider_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("external_tms_files_provider_resource_key").on(
      table.organizationId,
      table.providerKind,
      table.externalProjectId,
      table.resourceType,
      table.externalResourceId,
    ),
    index("idx_external_tms_files_org_project_path").on(
      table.organizationId,
      table.projectId,
      table.sourcePath,
    ),
    index("idx_external_tms_files_provider_project").on(
      table.organizationId,
      table.providerKind,
      table.externalProjectId,
    ),
    index("idx_external_tms_files_stored_file").on(table.storedFileId),
    index("idx_external_tms_files_sync_state").on(table.syncState),
  ],
);

/**
 * Stores captured versions of external TMS files so provider revisions can be linked to stored bytes and compared over time.
 */
export const externalTmsFileVersions = pgTable(
  "external_tms_file_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    externalTmsFileId: uuid("external_tms_file_id")
      .notNull()
      .references(() => externalTmsFiles.id, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    revision: text("revision"),
    sourceHash: text("source_hash"),
    storedFileId: text("stored_file_id").references(() => storedFiles.id, {
      onDelete: "set null",
    }),
    format: text("format"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_external_tms_file_versions_file_captured").on(
      table.externalTmsFileId,
      table.capturedAt,
    ),
    index("idx_external_tms_file_versions_org_project_path").on(
      table.organizationId,
      table.projectId,
      table.sourcePath,
    ),
  ],
);
