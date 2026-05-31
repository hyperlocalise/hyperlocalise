import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  externalTmsProviderKindEnum,
  providerSyncIntentCauseEnum,
  providerSyncIntentStatusEnum,
  providerSyncRunKindEnum,
  providerSyncRunStatusEnum,
  providerWebhookEventProcessingStatusEnum,
  providerWebhookSubscriptionStatusEnum,
  tmsAgentAutomationScopeEnum,
  llmProviderEnum,
} from "./enums";
import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Stores encrypted AI provider credentials for an organization, including provider, default model, masked key suffix, validation timestamp, and audit ownership.
 */
export const organizationLlmProviderCredentials = pgTable(
  "organization_llm_provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    provider: llmProviderEnum("provider").notNull(),
    defaultModel: text("default_model").notNull(),
    maskedApiKeySuffix: text("masked_api_key_suffix").notNull(),
    encryptionAlgorithm: text("encryption_algorithm").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("organization_llm_provider_credentials_org_provider_key").on(
      table.organizationId,
      table.provider,
    ),
    index("idx_organization_llm_provider_credentials_updated_at").on(table.updatedAt),
  ],
);

/**
 * Stores encrypted external TMS credentials for an organization. These rows back connected projects, provider sync, webhook setup, and provider health checks.
 */
export const organizationExternalTmsProviderCredentials = pgTable(
  "organization_external_tms_provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    displayName: text("display_name").notNull(),
    region: text("region"),
    baseUrl: text("base_url"),
    validationStatus: text("validation_status").notNull().default("unvalidated"),
    validationMessage: text("validation_message"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    encryptionAlgorithm: text("encryption_algorithm").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    maskedSecretSuffix: text("masked_secret_suffix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("organization_external_tms_provider_credentials_org_provider_kind_key").on(
      table.organizationId,
      table.providerKind,
    ),
    index("idx_organization_external_tms_provider_credentials_updated_at").on(table.updatedAt),
  ],
);

/**
 * Stores automation configuration for provider-facing TMS agents at organization, project, or provider scope, with shape constraints that keep each scope unambiguous.
 */
export const tmsAgentAutomationSettings = pgTable(
  "tms_agent_automation_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: tmsAgentAutomationScopeEnum("scope").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    providerCredentialId: uuid("provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "cascade" },
    ),
    settings: jsonb("settings")
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
    unique("tms_agent_automation_settings_org_scope_key")
      .on(table.organizationId, table.scope, table.projectId, table.providerCredentialId)
      .nullsNotDistinct(),
    index("idx_tms_agent_automation_settings_org").on(table.organizationId),
    check(
      "tms_agent_automation_settings_scope_shape",
      sql`(
        (${table.scope} = 'organization' AND ${table.projectId} IS NULL AND ${table.providerCredentialId} IS NULL)
        OR (${table.scope} = 'project' AND ${table.projectId} IS NOT NULL AND ${table.providerCredentialId} IS NULL)
        OR (${table.scope} = 'provider' AND ${table.projectId} IS NULL AND ${table.providerCredentialId} IS NOT NULL)
      )`,
    ),
  ],
);

/**
 * Records concrete provider synchronization executions, including run type, status, provider resource scope, counts, errors, timing, and diagnostic metadata.
 */
export const providerSyncRuns = pgTable(
  "provider_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    providerCredentialId: uuid("provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "set null" },
    ),
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    kind: providerSyncRunKindEnum("kind").notNull(),
    status: providerSyncRunStatusEnum("status").notNull().default("running"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    externalProjectId: text("external_project_id"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    externalResourceId: text("external_resource_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    counts: jsonb("counts")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    providerMetadata: jsonb("provider_metadata")
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
    index("idx_provider_sync_runs_org_started").on(table.organizationId, table.startedAt),
    index("idx_provider_sync_runs_org_provider_started").on(
      table.organizationId,
      table.providerKind,
      table.startedAt,
    ),
    index("idx_provider_sync_runs_org_kind_started").on(
      table.organizationId,
      table.kind,
      table.startedAt,
    ),
    index("idx_provider_sync_runs_org_project_started").on(
      table.organizationId,
      table.projectId,
      table.startedAt,
    ),
    index("idx_provider_sync_runs_org_resource_started").on(
      table.organizationId,
      table.resourceType,
      table.resourceId,
      table.startedAt,
    ),
    index("idx_provider_sync_runs_status").on(table.status),
  ],
);

/**
 * Stores coalesced units of provider sync work created by webhooks, manual actions, or schedules. Intents support leasing, retries, dedupe, and run linkage.
 */
export const providerSyncIntents = pgTable(
  "provider_sync_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    providerCredentialId: uuid("provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "set null" },
    ),
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    syncKind: providerSyncRunKindEnum("sync_kind").notNull(),
    resourceId: text("resource_id"),
    resourceIds: jsonb("resource_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    cause: providerSyncIntentCauseEnum("cause").notNull(),
    eventReferences: jsonb("event_references")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    priority: integer("priority").notNull().default(0),
    status: providerSyncIntentStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    leaseKey: text("lease_key").notNull(),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    leasedBy: text("leased_by"),
    leaseToken: text("lease_token"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    providerSyncRunId: uuid("provider_sync_run_id").references(() => providerSyncRuns.id, {
      onDelete: "set null",
    }),
    lastError: text("last_error"),
    errorDetails: jsonb("error_details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_provider_sync_intents_org_created").on(table.organizationId, table.createdAt),
    index("idx_provider_sync_intents_status_next_attempt").on(table.status, table.nextAttemptAt),
    index("idx_provider_sync_intents_lease_key").on(table.leaseKey),
    uniqueIndex("provider_sync_intents_lease_key_active_key")
      .on(table.leaseKey)
      .where(sql`${table.status} in ('pending', 'running', 'retryable')`),
  ],
);

/**
 * Stores provider webhook subscription registrations, encrypted secret metadata, subscribed events, setup status, manual fallback details, and audit timestamps.
 */
export const providerWebhookSubscriptions = pgTable(
  "provider_webhook_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    providerCredentialId: uuid("provider_credential_id")
      .notNull()
      .references(() => organizationExternalTmsProviderCredentials.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    providerWebhookId: text("provider_webhook_id").notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    secretMetadata: jsonb("secret_metadata")
      .$type<{
        maskedSecretSuffix?: string;
        encryptionAlgorithm?: string;
        keyVersion?: number;
      }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    webhookSecretCiphertext: text("webhook_secret_ciphertext"),
    webhookSecretIv: text("webhook_secret_iv"),
    webhookSecretAuthTag: text("webhook_secret_auth_tag"),
    webhookSecretKeyVersion: integer("webhook_secret_key_version"),
    subscribedEvents: jsonb("subscribed_events")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: providerWebhookSubscriptionStatusEnum("status").notNull().default("pending"),
    manualFallback: jsonb("manual_fallback")
      .$type<{
        webhookUrl: string;
        secretHeaderName?: string;
        secretInstructions?: string;
        subscribedEvents: string[];
        lastError?: string;
      }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastAuditedAt: timestamp("last_audited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("provider_webhook_subscriptions_credential_webhook_key").on(
      table.providerCredentialId,
      table.providerWebhookId,
    ),
    index("idx_provider_webhook_subscriptions_org").on(table.organizationId),
    index("idx_provider_webhook_subscriptions_credential").on(table.providerCredentialId),
    index("idx_provider_webhook_subscriptions_credential_project").on(
      table.providerCredentialId,
      table.projectId,
    ),
    uniqueIndex("provider_webhook_subscriptions_credential_project_key").on(
      table.providerCredentialId,
      table.projectId,
    ),
    index("idx_provider_webhook_subscriptions_org_status").on(table.organizationId, table.status),
  ],
);

/**
 * Stores accepted provider webhook deliveries with dedupe keys, redacted payloads, processing status, retry metadata, and links to sync intents or runs.
 */
export const providerWebhookEvents = pgTable(
  "provider_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => providerWebhookSubscriptions.id, { onDelete: "cascade" }),
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    externalResourceId: text("external_resource_id"),
    redactedPayload: jsonb("redacted_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    processingStatus: providerWebhookEventProcessingStatusEnum("processing_status")
      .notNull()
      .default("pending"),
    dedupeKey: text("dedupe_key").notNull(),
    // Workflow run id returned by workflow/api start(); opaque until provider_sync_intents exists.
    providerSyncIntentId: text("provider_sync_intent_id"),
    providerSyncRunId: uuid("provider_sync_run_id").references(() => providerSyncRuns.id, {
      onDelete: "set null",
    }),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    attemptCount: integer("attempt_count").notNull().default(0),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("provider_webhook_events_subscription_provider_event_key").on(
      table.subscriptionId,
      table.providerEventId,
    ),
    uniqueIndex("provider_webhook_events_subscription_dedupe_key").on(
      table.subscriptionId,
      table.dedupeKey,
    ),
    index("idx_provider_webhook_events_org_received").on(table.organizationId, table.receivedAt),
    index("idx_provider_webhook_events_subscription_received").on(
      table.subscriptionId,
      table.receivedAt,
    ),
    index("idx_provider_webhook_events_pending_retry").on(
      table.processingStatus,
      table.nextRetryAt,
    ),
    index("idx_provider_webhook_events_sync_run").on(table.providerSyncRunId),
  ],
);
