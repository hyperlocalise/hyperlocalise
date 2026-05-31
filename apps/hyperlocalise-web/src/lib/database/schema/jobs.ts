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
  jobKindEnum,
  jobStatusEnum,
  translationJobOutcomeKindEnum,
  translationJobTypeEnum,
  usageEventStatusEnum,
  usageFeatureIdEnum,
} from "./enums";
import { organizations, users } from "./organizations";
import { projects } from "./projects";
import { organizationApiKeys } from "./integrations";
import { interactions } from "./agents";
import { repositorySourceFileVersions } from "./files";

/**
 * Stores the canonical workspace job record used by APIs, workers, inbox workflows, usage tracking, and status views across translation, review, sync, and other job kinds.
 */
export const jobs = pgTable(
  "jobs",
  {
    // Stable job identifier returned to clients and used for status lookups.
    id: text("id").primaryKey(),
    // Tenant that owns this job, stored directly for workspace-level job queries.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Optional project context. Some jobs are workspace-level rather than project-level.
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    // User who triggered the job, stored as an internal user ID.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Owner assigned for review or human oversight.
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    // High-level job category used by routing, workers, and workspace job lists.
    kind: jobKindEnum("kind").notNull(),
    // App-level lifecycle state mirrored into Postgres for UI/API reads.
    status: jobStatusEnum("status").notNull().default("queued"),
    // Canonical job input stored as domain data, not workflow engine state.
    inputPayload: jsonb("input_payload").$type<unknown>().notNull(),
    // Terminal job output persisted for retrieval after execution completes.
    outcomePayload: jsonb("outcome_payload").$type<unknown>(),
    // Last human-readable failure message captured for debugging and UI display.
    lastError: text("last_error"),
    // External workflow execution reference for tracing across orchestration systems.
    workflowRunId: text("workflow_run_id"),
    // Link back to the API key that created this job, for audit.
    apiKeyId: uuid("api_key_id").references(() => organizationApiKeys.id, {
      onDelete: "set null",
    }),
    // Link back to the interaction that created this job, for Inbox display.
    interactionId: uuid("interaction_id").references(() => interactions.id, {
      onDelete: "set null",
    }),
    // Explicit inspectable context packet assembled before execution.
    contextSnapshot: jsonb("context_snapshot")
      .$type<unknown>()
      .default(sql`'{}'::jsonb`),
    // When the job record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When job state last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    // When the job entered a terminal state, if it has completed.
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_jobs_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_jobs_project_created_at").on(table.projectId, table.createdAt),
    index("idx_jobs_created_by_user_id").on(table.createdByUserId),
    index("idx_jobs_owner_user_id").on(table.ownerUserId),
    index("idx_jobs_kind_status").on(table.kind, table.status),
    index("idx_jobs_workflow_run_id").on(table.workflowRunId),
    index("idx_jobs_status").on(table.status),
    index("idx_jobs_interaction").on(table.interactionId),
    index("idx_jobs_api_key_id").on(table.apiKeyId),
  ],
);

/**
 * Stores translation-specific details for jobs, including string versus file mode, optional source file version, and the outcome kind expected by consumers.
 */
export const translationJobDetails = pgTable(
  "translation_job_details",
  {
    // One-to-one extension row for jobs whose kind is "translation".
    jobId: text("job_id")
      .primaryKey()
      .references(() => jobs.id, { onDelete: "cascade" }),
    // Translation subtype; string jobs are supported first, file jobs can follow.
    type: translationJobTypeEnum("type").notNull(),
    sourceFileVersionId: uuid("source_file_version_id").references(
      () => repositorySourceFileVersions.id,
      { onDelete: "set null" },
    ),
    // Describes the shape of a successful translation result or terminal error payload.
    outcomeKind: translationJobOutcomeKindEnum("outcome_kind"),
  },
  (table) => [
    index("idx_translation_job_details_type").on(table.type),
    index("idx_translation_job_details_source_file_version").on(table.sourceFileVersionId),
    index("idx_translation_job_details_outcome_kind").on(table.outcomeKind),
  ],
);

/**
 * Stores metered usage events tied to organizations, features, actors, API keys, jobs, and interactions so billing can reserve, accept, reject, and track usage.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    featureId: usageFeatureIdEnum("feature_id").notNull(),
    status: usageEventStatusEnum("status").notNull().default("reserved"),
    operationKey: text("operation_key").notNull(),
    quantity: integer("quantity").notNull().default(1),
    dimensions: jsonb("dimensions")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    source: text("source").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    apiKeyId: uuid("api_key_id").references(() => organizationApiKeys.id, { onDelete: "set null" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    interactionId: uuid("interaction_id").references(() => interactions.id, {
      onDelete: "set null",
    }),
    autumnTrackedAt: timestamp("autumn_tracked_at", { withTimezone: true }),
    autumnTrackError: text("autumn_track_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("usage_events_operation_key_key").on(table.operationKey),
    index("idx_usage_events_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_usage_events_feature_status").on(table.featureId, table.status),
    index("idx_usage_events_job_id").on(table.jobId),
  ],
);

/**
 * Stores review-specific job configuration such as criteria, target locale, and structured review settings.
 */
export const reviewJobDetails = pgTable("review_job_details", {
  jobId: text("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  criteria: text("criteria").notNull().default(""),
  targetLocale: text("target_locale"),
  config: jsonb("config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
});

/**
 * Stores sync-specific job configuration such as connector kind, direction, and provider or repository identifiers.
 */
export const syncJobDetails = pgTable("sync_job_details", {
  jobId: text("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  connectorKind: text("connector_kind").notNull(),
  direction: text("direction").notNull(),
  externalIdentifiers: jsonb("external_identifiers")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
});

/**
 * Stores asset-management job configuration, including asset type, operation, and structured options.
 */
export const assetManagementJobDetails = pgTable("asset_management_job_details", {
  jobId: text("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  assetType: text("asset_type").notNull(),
  operation: text("operation").notNull(),
  config: jsonb("config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
});

/**
 * Stores provider-originated job records mirrored from external TMS systems, including provider status, task identifiers, target locales, assignments, payload, and optional native job linkage.
 */
export const externalJobDetails = pgTable(
  "external_job_details",
  {
    // One-to-one extension row for jobs that originated from an external TMS provider.
    jobId: text("job_id")
      .primaryKey()
      .references(() => jobs.id, { onDelete: "cascade" }),
    // Tenant that owns this external job, denormalized for unique index scoping.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Provider that owns this external job.
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    // Provider-scoped job identifier used for idempotent upserts.
    externalJobId: text("external_job_id").notNull(),
    // Optional provider task identifier when the provider uses a job/task hierarchy.
    externalTaskId: text("external_task_id"),
    // Raw provider status string preserved for diagnostics.
    externalStatus: text("external_status").notNull(),
    // Human-readable title from the provider.
    title: text("title").notNull().default(""),
    // Provider due date, if available.
    dueDate: timestamp("due_date", { withTimezone: true }),
    // Target locales from the provider job payload.
    targetLocales: jsonb("target_locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Assigned user identifiers (emails or external IDs) from the provider.
    assignedUsers: jsonb("assigned_users")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Direct URL to the job in the provider UI.
    externalUrl: text("external_url"),
    // Sync state tracked independently of provider status for UI badges.
    syncState: text("sync_state").notNull().default("pending"),
    // Raw provider payload retained for debugging and forward compatibility.
    providerPayload: jsonb("provider_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Optional link to a native Hyperlocalise job created when agent work is started.
    linkedJobId: text("linked_job_id").references(() => jobs.id, { onDelete: "set null" }),
    // When the external job record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the external job record was last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_external_job_details_provider_kind").on(table.providerKind),
    index("idx_external_job_details_external_job_id").on(table.externalJobId),
    index("idx_external_job_details_external_task_id").on(table.externalTaskId),
    index("idx_external_job_details_sync_state").on(table.syncState),
    index("idx_external_job_details_linked_job").on(table.linkedJobId),
    uniqueIndex("idx_external_job_details_provider_job_unique").on(
      table.organizationId,
      table.externalJobId,
      table.providerKind,
    ),
  ],
);
