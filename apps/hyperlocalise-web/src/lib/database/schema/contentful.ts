import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { workspaceAutomationRuns } from "./agents";
import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Stores encrypted Contentful Management API connections for an organization.
 * A connection maps one Contentful space/environment to one Hyperlocalise project.
 */
export const contentfulConnections = pgTable(
  "contentful_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    spaceId: text("space_id").notNull(),
    environmentId: text("environment_id").notNull().default("master"),
    sourceLocale: text("source_locale").notNull(),
    targetLocales: jsonb("target_locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    contentTypeIds: jsonb("content_type_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    fieldConfig: jsonb("field_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    enabled: boolean("enabled").notNull().default(true),
    validationStatus: text("validation_status").notNull().default("unvalidated"),
    validationMessage: text("validation_message"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    encryptionAlgorithm: text("encryption_algorithm").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    maskedTokenSuffix: text("masked_token_suffix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("contentful_connections_org_space_env_key").on(
      table.organizationId,
      table.spaceId,
      table.environmentId,
    ),
    index("idx_contentful_connections_org").on(table.organizationId),
    index("idx_contentful_connections_project").on(table.projectId),
  ],
);

/**
 * Stores Hyperlocalise-facing webhook endpoint configuration for Contentful.
 */
export const contentfulWebhookSubscriptions = pgTable(
  "contentful_webhook_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => contentfulConnections.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    secretHash: text("secret_hash").notNull(),
    providerWebhookId: text("provider_webhook_id"),
    lastDeliveryId: text("last_delivery_id"),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("contentful_webhook_subscriptions_connection_key").on(table.connectionId),
    index("idx_contentful_webhook_subscriptions_org").on(table.organizationId),
    index("idx_contentful_webhook_subscriptions_provider_webhook").on(table.providerWebhookId),
  ],
);

/**
 * Dedupe and diagnostic projection for inbound Contentful webhook deliveries.
 */
export const contentfulWebhookEvents = pgTable(
  "contentful_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => contentfulConnections.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => contentfulWebhookSubscriptions.id, { onDelete: "cascade" }),
    providerEventId: text("provider_event_id"),
    dedupeKey: text("dedupe_key").notNull(),
    eventType: text("event_type").notNull(),
    entryId: text("entry_id"),
    contentTypeId: text("content_type_id"),
    revision: integer("revision"),
    processingStatus: text("processing_status").notNull().default("pending"),
    redactedPayload: jsonb("redacted_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: jsonb("error").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("contentful_webhook_events_dedupe_key").on(table.subscriptionId, table.dedupeKey),
    index("idx_contentful_webhook_events_org_created").on(table.organizationId, table.createdAt),
    index("idx_contentful_webhook_events_status").on(table.processingStatus),
  ],
);

/**
 * Durable Contentful automation execution state linked to workspace automation runs.
 */
export const contentfulTranslationRuns = pgTable(
  "contentful_translation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => contentfulConnections.id, { onDelete: "cascade" }),
    workspaceAutomationRunId: uuid("workspace_automation_run_id").references(
      () => workspaceAutomationRuns.id,
      { onDelete: "set null" },
    ),
    webhookEventId: uuid("webhook_event_id").references(() => contentfulWebhookEvents.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("queued"),
    entryId: text("entry_id").notNull(),
    contentTypeId: text("content_type_id"),
    sourceLocale: text("source_locale").notNull(),
    targetLocales: jsonb("target_locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    runQa: boolean("run_qa").notNull().default(true),
    overwriteDraftLocales: boolean("overwrite_draft_locales").notNull().default(false),
    detectedFields: jsonb("detected_fields")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    qaSummary: jsonb("qa_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    writebackSummary: jsonb("writeback_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    warnings: jsonb("warnings")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    error: jsonb("error").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_contentful_translation_runs_org_created").on(table.organizationId, table.createdAt),
    index("idx_contentful_translation_runs_connection").on(table.connectionId),
    index("idx_contentful_translation_runs_status").on(table.status),
    index("idx_contentful_translation_runs_automation_run").on(table.workspaceAutomationRunId),
  ],
);

/**
 * Per-field translation/writeback outcome for a Contentful automation run.
 */
export const contentfulTranslationRunItems = pgTable(
  "contentful_translation_run_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => contentfulTranslationRuns.id, { onDelete: "cascade" }),
    fieldId: text("field_id").notNull(),
    fieldName: text("field_name"),
    locale: text("locale").notNull(),
    status: text("status").notNull().default("pending"),
    sourceHash: text("source_hash"),
    sourcePreview: text("source_preview"),
    translationPreview: text("translation_preview"),
    qaFindings: jsonb("qa_findings")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    error: jsonb("error").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_contentful_translation_run_items_run").on(table.runId),
    index("idx_contentful_translation_run_items_status").on(table.status),
  ],
);
