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
import { randomUUID } from "node:crypto";

import { and, count, desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type { JobChangeEventType } from "@/lib/job-change-events/job-change-events-contract";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { encryptProviderCredential } from "@/lib/security/provider-credential-crypto";
import { validatePublicHttpUrl } from "@/lib/security/ssrf-guard";

import {
  attemptWebhookDelivery,
  type WebhookDeliveryRow,
  type WebhookEndpointRow,
  type WebhookSender,
} from "./webhook-deliveries";
import { generateWebhookSecret } from "./webhook-signing";

export const MAX_WEBHOOK_ENDPOINTS_PER_ORGANIZATION = 20;
export const WEBHOOK_TEST_EVENT_TYPE = "webhook.test";

export type WebhookEndpointSummary = {
  id: string;
  url: string;
  description: string | null;
  eventTypes: JobChangeEventType[];
  projectId: string | null;
  enabled: boolean;
  disabledReason: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliverySummary = {
  id: string;
  eventId: string | null;
  eventType: string;
  status: "pending" | "succeeded" | "failed";
  attemptCount: number;
  lastResponseStatus: number | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
};

export type WebhookEndpointError =
  | { code: "webhook_endpoint_not_found" }
  | { code: "webhook_endpoint_limit_reached" }
  | { code: "webhook_url_invalid" }
  | { code: "webhook_secret_encryption_failed" };

function toSummary(row: WebhookEndpointRow): WebhookEndpointSummary {
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    eventTypes: row.eventTypes,
    projectId: row.projectId,
    enabled: row.disabledAt === null,
    disabledReason: row.disabledReason,
    consecutiveFailures: row.consecutiveFailures,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDeliverySummary(row: WebhookDeliveryRow): WebhookDeliverySummary {
  return {
    id: row.id,
    eventId: row.eventId,
    eventType: row.eventType,
    status: row.status,
    attemptCount: row.attemptCount,
    lastResponseStatus: row.lastResponseStatus,
    lastError: row.lastError,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    nextAttemptAt: row.status === "pending" ? row.nextAttemptAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** HTTPS on a public host only; the address is checked again, with DNS, on every send. */
export function validateWebhookEndpointUrl(value: string): Result<string, WebhookEndpointError> {
  const result = validatePublicHttpUrl(value.trim());
  if (isErr(result) || result.value.protocol !== "https:") {
    return err({ code: "webhook_url_invalid" });
  }
  return ok(result.value.toString());
}

function encryptSecret(secret: string) {
  const encrypted = encryptProviderCredential(secret);
  return isErr(encrypted) ? null : encrypted.value;
}

async function findEndpoint(organizationId: string, endpointId: string) {
  const [row] = await db
    .select()
    .from(schema.webhookEndpoints)
    .where(
      and(
        eq(schema.webhookEndpoints.organizationId, organizationId),
        eq(schema.webhookEndpoints.id, endpointId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listWebhookEndpoints(
  organizationId: string,
): Promise<WebhookEndpointSummary[]> {
  const rows = await db
    .select()
    .from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.organizationId, organizationId))
    .orderBy(desc(schema.webhookEndpoints.createdAt));
  return rows.map(toSummary);
}

/** Creates an endpoint. The plaintext secret is returned this once and never again. */
export async function createWebhookEndpoint(input: {
  organizationId: string;
  userId: string | null;
  url: string;
  description?: string | null;
  eventTypes: JobChangeEventType[];
  projectId?: string | null;
}): Promise<Result<{ endpoint: WebhookEndpointSummary; secret: string }, WebhookEndpointError>> {
  const url = validateWebhookEndpointUrl(input.url);
  if (isErr(url)) {
    return url;
  }

  const [existing] = await db
    .select({ count: count() })
    .from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.organizationId, input.organizationId));
  if ((existing?.count ?? 0) >= MAX_WEBHOOK_ENDPOINTS_PER_ORGANIZATION) {
    return err({ code: "webhook_endpoint_limit_reached" });
  }

  const secret = generateWebhookSecret();
  const encrypted = encryptSecret(secret);
  if (!encrypted) {
    return err({ code: "webhook_secret_encryption_failed" });
  }

  const [row] = await db
    .insert(schema.webhookEndpoints)
    .values({
      organizationId: input.organizationId,
      url: url.value,
      description: input.description?.trim() || null,
      eventTypes: [...new Set(input.eventTypes)],
      projectId: input.projectId || null,
      secret: encrypted,
      createdByUserId: input.userId,
    })
    .returning();
  return ok({ endpoint: toSummary(row!), secret });
}

export async function updateWebhookEndpoint(input: {
  organizationId: string;
  endpointId: string;
  url?: string;
  description?: string | null;
  eventTypes?: JobChangeEventType[];
  projectId?: string | null;
  enabled?: boolean;
}): Promise<Result<WebhookEndpointSummary, WebhookEndpointError>> {
  const existing = await findEndpoint(input.organizationId, input.endpointId);
  if (!existing) {
    return err({ code: "webhook_endpoint_not_found" });
  }

  const changes: Partial<typeof schema.webhookEndpoints.$inferInsert> = {};
  if (input.url !== undefined) {
    const url = validateWebhookEndpointUrl(input.url);
    if (isErr(url)) {
      return url;
    }
    changes.url = url.value;
  }
  if (input.description !== undefined) {
    changes.description = input.description?.trim() || null;
  }
  if (input.eventTypes !== undefined) {
    changes.eventTypes = [...new Set(input.eventTypes)];
  }
  if (input.projectId !== undefined) {
    changes.projectId = input.projectId || null;
  }
  if (input.enabled === true && existing.disabledAt) {
    changes.disabledAt = null;
    changes.disabledReason = null;
    changes.consecutiveFailures = 0;
  } else if (input.enabled === false && !existing.disabledAt) {
    changes.disabledAt = new Date();
    changes.disabledReason = "disabled_by_user";
  }

  if (Object.keys(changes).length === 0) {
    return ok(toSummary(existing));
  }

  const [row] = await db
    .update(schema.webhookEndpoints)
    .set(changes)
    .where(eq(schema.webhookEndpoints.id, existing.id))
    .returning();
  return ok(toSummary(row!));
}

export async function deleteWebhookEndpoint(input: {
  organizationId: string;
  endpointId: string;
}): Promise<Result<void, WebhookEndpointError>> {
  const deleted = await db
    .delete(schema.webhookEndpoints)
    .where(
      and(
        eq(schema.webhookEndpoints.organizationId, input.organizationId),
        eq(schema.webhookEndpoints.id, input.endpointId),
      ),
    )
    .returning({ id: schema.webhookEndpoints.id });
  return deleted.length === 0 ? err({ code: "webhook_endpoint_not_found" }) : ok(undefined);
}

/** Replaces the signing secret at once; the old one stops working with the next delivery. */
export async function rotateWebhookEndpointSecret(input: {
  organizationId: string;
  endpointId: string;
}): Promise<Result<{ secret: string }, WebhookEndpointError>> {
  const existing = await findEndpoint(input.organizationId, input.endpointId);
  if (!existing) {
    return err({ code: "webhook_endpoint_not_found" });
  }
  const secret = generateWebhookSecret();
  const encrypted = encryptSecret(secret);
  if (!encrypted) {
    return err({ code: "webhook_secret_encryption_failed" });
  }
  await db
    .update(schema.webhookEndpoints)
    .set({ secret: encrypted })
    .where(eq(schema.webhookEndpoints.id, existing.id));
  return ok({ secret });
}

export async function listWebhookDeliveries(input: {
  organizationId: string;
  endpointId: string;
  limit?: number;
}): Promise<Result<WebhookDeliverySummary[], WebhookEndpointError>> {
  const existing = await findEndpoint(input.organizationId, input.endpointId);
  if (!existing) {
    return err({ code: "webhook_endpoint_not_found" });
  }
  const rows = await db
    .select()
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.endpointId, existing.id))
    .orderBy(desc(schema.webhookDeliveries.createdAt))
    .limit(Math.min(input.limit ?? 50, 100));
  return ok(rows.map(toDeliverySummary));
}

/** Sends a `webhook.test` event right away, outside the retry schedule, and reports the result. */
export async function sendWebhookTestEvent(input: {
  organizationId: string;
  endpointId: string;
  sender?: WebhookSender;
}): Promise<Result<WebhookDeliverySummary, WebhookEndpointError>> {
  const endpoint = await findEndpoint(input.organizationId, input.endpointId);
  if (!endpoint) {
    return err({ code: "webhook_endpoint_not_found" });
  }

  const eventId = randomUUID();
  const [delivery] = await db
    .insert(schema.webhookDeliveries)
    .values({
      organizationId: input.organizationId,
      endpointId: endpoint.id,
      eventId: null,
      eventType: WEBHOOK_TEST_EVENT_TYPE,
      payload: {
        id: eventId,
        type: WEBHOOK_TEST_EVENT_TYPE,
        createdAt: new Date().toISOString(),
        data: {},
      },
      // A test is sent once; it never joins the retry queue.
      status: "failed",
      claimedUntil: new Date(Date.now() + 60_000),
    })
    .returning();

  await attemptWebhookDelivery({ delivery: delivery!, endpoint, sender: input.sender, test: true });

  const [row] = await db
    .select()
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.id, delivery!.id))
    .limit(1);
  return ok(toDeliverySummary(row!));
}
