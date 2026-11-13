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
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { JobChangeEventType } from "@/lib/job-change-events/job-change-events-contract";
import type { EncryptedProviderCredential } from "@/lib/security/provider-credential-crypto";

import { organizations, users } from "./organizations";

/** Where one outbound webhook delivery stands: waiting for (another) attempt, done, or given up. */
export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "succeeded",
  "failed",
]);

/**
 * A URL a workspace registered to receive signed job change events. An empty `eventTypes` list
 * means every event type; `projectId` narrows deliveries to one project.
 */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: text("description"),
    eventTypes: jsonb("event_types")
      .$type<JobChangeEventType[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    projectId: text("project_id"),
    // HMAC signing secret, encrypted with the provider credentials master key.
    secret: jsonb("secret").$type<EncryptedProviderCredential>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Set by a person, or automatically after too many failed deliveries in a row.
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledReason: text("disabled_reason"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("idx_webhook_endpoints_org").on(table.organizationId)],
);

/**
 * One event sent (or to be sent) to one endpoint. Its id is the `webhook-id` header, so receivers
 * can drop duplicates across retries.
 */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    // The job change event delivered; null for a test event sent from settings.
    eventId: uuid("event_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    claimedUntil: timestamp("claimed_until", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastResponseStatus: integer("last_response_status"),
    // A stable code such as `timeout` or `http_500`; never the response body.
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_webhook_deliveries_endpoint_event").on(table.endpointId, table.eventId),
    index("idx_webhook_deliveries_due")
      .on(table.nextAttemptAt)
      .where(sql`${table.status} = 'pending'`),
    index("idx_webhook_deliveries_endpoint_created_at").on(table.endpointId, table.createdAt),
  ],
);
