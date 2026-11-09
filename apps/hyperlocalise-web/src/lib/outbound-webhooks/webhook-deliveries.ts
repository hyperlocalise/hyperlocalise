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
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import {
  toJobChangeEventPayload,
  type JobChangeEventRecord,
} from "@/lib/job-change-events/job-change-events-contract";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { decryptProviderCredential } from "@/lib/security/provider-credential-crypto";
import { withPublicHttpFetch } from "@/lib/security/public-http-fetch";

import { buildWebhookHeaders } from "./webhook-signing";

const logger = createLogger("outbound-webhooks");

/** Wait before each retry; the first attempt goes out on the next tick. About 28 hours in all. */
export const WEBHOOK_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  5 * 60 * 60_000,
  10 * 60 * 60_000,
  10 * 60 * 60_000,
] as const;
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length + 1;
/** Failed attempts in a row, across deliveries, after which an endpoint is switched off. */
export const WEBHOOK_AUTO_DISABLE_AFTER_FAILURES = 40;
export const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000;
// Longer than the cron function can run (300s), so a slow batch is never sent twice.
const DELIVERY_CLAIM_LEASE_MS = 6 * 60_000;
const DELIVERY_CONCURRENCY = 8;

export type WebhookEndpointRow = typeof schema.webhookEndpoints.$inferSelect;
export type WebhookDeliveryRow = typeof schema.webhookDeliveries.$inferSelect;

export type WebhookSendOutcome =
  | { ok: true; status: number }
  | { ok: false; status: number | null; error: string };

export type WebhookSender = (input: {
  url: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}) => Promise<WebhookSendOutcome>;

/** Sends through the SSRF guard: public hosts only, DNS pinned, no redirects followed. */
export const defaultWebhookSender: WebhookSender = async (input) => {
  try {
    return await withPublicHttpFetch(
      input.url,
      {
        method: "POST",
        headers: input.headers,
        body: input.body,
        redirect: "manual",
        signal: input.signal,
      },
      async (response) => {
        await response.body?.cancel().catch(() => undefined);
        if (response.status >= 200 && response.status < 300) {
          return { ok: true as const, status: response.status };
        }
        return { ok: false as const, status: response.status, error: `http_${response.status}` };
      },
      { maxResponseSize: 64 * 1024 },
    );
  } catch (error) {
    if (input.signal.aborted) {
      return { ok: false, status: null, error: "timeout" };
    }
    const message = error instanceof Error ? error.message : "";
    if (/blocked|restricted|not allowed|unresolvable|protocol|invalid url/i.test(message)) {
      return { ok: false, status: null, error: "unsafe_url" };
    }
    return { ok: false, status: null, error: "network_error" };
  }
};

export function nextWebhookAttemptDelayMs(attemptCount: number): number | null {
  return WEBHOOK_RETRY_DELAYS_MS[attemptCount - 1] ?? null;
}

export function webhookEndpointAcceptsEvent(
  endpoint: Pick<WebhookEndpointRow, "eventTypes" | "projectId" | "disabledAt">,
  event: Pick<JobChangeEventRecord, "type" | "projectId">,
): boolean {
  if (endpoint.disabledAt) {
    return false;
  }
  if (endpoint.projectId && endpoint.projectId !== event.projectId) {
    return false;
  }
  return endpoint.eventTypes.length === 0 || endpoint.eventTypes.includes(event.type);
}

/** Queues one delivery per matching endpoint. Safe to repeat for the same event. */
export async function enqueueWebhookDeliveriesForEvent(
  event: JobChangeEventRecord,
  database: Pick<typeof db, "select" | "insert"> = db,
): Promise<number> {
  const endpoints = await database
    .select()
    .from(schema.webhookEndpoints)
    .where(
      and(
        eq(schema.webhookEndpoints.organizationId, event.organizationId),
        isNull(schema.webhookEndpoints.disabledAt),
      ),
    );
  const matching = endpoints.filter((endpoint) => webhookEndpointAcceptsEvent(endpoint, event));
  if (matching.length === 0) {
    return 0;
  }

  const payload = toJobChangeEventPayload(event);
  const inserted = await database
    .insert(schema.webhookDeliveries)
    .values(
      matching.map((endpoint) => ({
        organizationId: event.organizationId,
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: event.type,
        payload,
      })),
    )
    .onConflictDoNothing({
      target: [schema.webhookDeliveries.endpointId, schema.webhookDeliveries.eventId],
    })
    .returning({ id: schema.webhookDeliveries.id });
  return inserted.length;
}

function decryptEndpointSecret(endpoint: WebhookEndpointRow): string | null {
  const result = decryptProviderCredential(endpoint.secret);
  return isErr(result) ? null : result.value;
}

async function recordAttempt(input: {
  delivery: WebhookDeliveryRow;
  endpoint: WebhookEndpointRow;
  outcome: WebhookSendOutcome;
  now: Date;
  test: boolean;
}): Promise<"succeeded" | "retrying" | "failed"> {
  const attemptCount = input.delivery.attemptCount + 1;
  const retryDelay =
    input.outcome.ok || input.test ? null : nextWebhookAttemptDelayMs(attemptCount);
  const status = input.outcome.ok ? "succeeded" : retryDelay === null ? "failed" : "retrying";

  await db.transaction(async (tx) => {
    await tx
      .update(schema.webhookDeliveries)
      .set({
        status: status === "retrying" ? "pending" : status,
        attemptCount,
        lastAttemptAt: input.now,
        lastResponseStatus: input.outcome.status,
        lastError: input.outcome.ok ? null : input.outcome.error,
        claimedUntil: null,
        nextAttemptAt: retryDelay === null ? input.now : new Date(input.now.getTime() + retryDelay),
        completedAt: status === "retrying" ? null : input.now,
      })
      .where(eq(schema.webhookDeliveries.id, input.delivery.id));

    if (input.test) {
      return;
    }
    if (input.outcome.ok) {
      await tx
        .update(schema.webhookEndpoints)
        .set({ consecutiveFailures: 0 })
        .where(eq(schema.webhookEndpoints.id, input.endpoint.id));
      return;
    }

    const [endpoint] = await tx
      .update(schema.webhookEndpoints)
      .set({ consecutiveFailures: sql`${schema.webhookEndpoints.consecutiveFailures} + 1` })
      .where(eq(schema.webhookEndpoints.id, input.endpoint.id))
      .returning({
        consecutiveFailures: schema.webhookEndpoints.consecutiveFailures,
        disabledAt: schema.webhookEndpoints.disabledAt,
      });
    if (
      endpoint &&
      !endpoint.disabledAt &&
      endpoint.consecutiveFailures >= WEBHOOK_AUTO_DISABLE_AFTER_FAILURES
    ) {
      await tx
        .update(schema.webhookEndpoints)
        .set({ disabledAt: input.now, disabledReason: "too_many_failures" })
        .where(eq(schema.webhookEndpoints.id, input.endpoint.id));
      logger.warn(
        { webhookEndpointId: input.endpoint.id, consecutiveFailures: endpoint.consecutiveFailures },
        "outbound webhook endpoint disabled after repeated failures",
      );
    }
  });

  return status;
}

/** Signs and sends one delivery, then records the attempt. */
export async function attemptWebhookDelivery(input: {
  delivery: WebhookDeliveryRow;
  endpoint: WebhookEndpointRow;
  sender?: WebhookSender;
  now?: Date;
  /** A test event from settings: sent once, never retried, and not counted against the endpoint. */
  test?: boolean;
}): Promise<{ status: "succeeded" | "retrying" | "failed"; outcome: WebhookSendOutcome }> {
  const now = input.now ?? new Date();
  const secret = decryptEndpointSecret(input.endpoint);
  let outcome: WebhookSendOutcome;
  if (!secret) {
    outcome = { ok: false, status: null, error: "secret_unavailable" };
  } else {
    const body = JSON.stringify(input.delivery.payload);
    const headers = buildWebhookHeaders({
      secret,
      messageId: input.delivery.id,
      timestampSeconds: Math.floor(Date.now() / 1000),
      body,
    });
    outcome = await (input.sender ?? defaultWebhookSender)({
      url: input.endpoint.url,
      headers,
      body,
      signal: AbortSignal.timeout(WEBHOOK_REQUEST_TIMEOUT_MS),
    });
  }

  const status = await recordAttempt({
    delivery: input.delivery,
    endpoint: input.endpoint,
    outcome,
    now,
    test: input.test ?? false,
  });
  logger.info(
    {
      webhookDeliveryId: input.delivery.id,
      webhookEndpointId: input.endpoint.id,
      attempt: input.delivery.attemptCount + 1,
      responseStatus: outcome.status,
      result: status,
      error: outcome.ok ? undefined : outcome.error,
    },
    "outbound webhook attempt",
  );
  return { status, outcome };
}

export type DeliverDueWebhooksResult = {
  attempted: number;
  succeeded: number;
  retrying: number;
  failed: number;
};

async function claimDueDeliveries(
  limit: number,
  now: Date,
  organizationId?: string,
): Promise<WebhookDeliveryRow[]> {
  const leaseUntil = new Date(now.getTime() + DELIVERY_CLAIM_LEASE_MS);
  const due = db
    .select({ id: schema.webhookDeliveries.id })
    .from(schema.webhookDeliveries)
    .where(
      and(
        organizationId ? eq(schema.webhookDeliveries.organizationId, organizationId) : undefined,
        eq(schema.webhookDeliveries.status, "pending"),
        sql`${schema.webhookDeliveries.nextAttemptAt} <= ${now}`,
        sql`(${schema.webhookDeliveries.claimedUntil} IS NULL OR ${schema.webhookDeliveries.claimedUntil} <= ${now})`,
      ),
    )
    .orderBy(schema.webhookDeliveries.nextAttemptAt)
    .limit(limit)
    .for("update", { skipLocked: true });

  return db
    .update(schema.webhookDeliveries)
    .set({ claimedUntil: leaseUntil })
    .where(inArray(schema.webhookDeliveries.id, due))
    .returning();
}

export async function deliverDueWebhooks(input?: {
  limit?: number;
  now?: Date;
  sender?: WebhookSender;
  /** Only this workspace's deliveries, for replays and tests; every workspace when unset. */
  organizationId?: string;
}): Promise<DeliverDueWebhooksResult> {
  const now = input?.now ?? new Date();
  const deliveries = await claimDueDeliveries(input?.limit ?? 100, now, input?.organizationId);
  const result: DeliverDueWebhooksResult = { attempted: 0, succeeded: 0, retrying: 0, failed: 0 };
  if (deliveries.length === 0) {
    return result;
  }

  const endpointIds = [...new Set(deliveries.map((delivery) => delivery.endpointId))];
  const endpoints = new Map(
    (
      await db
        .select()
        .from(schema.webhookEndpoints)
        .where(inArray(schema.webhookEndpoints.id, endpointIds))
    ).map((endpoint) => [endpoint.id, endpoint]),
  );

  await mapWithConcurrency(deliveries, DELIVERY_CONCURRENCY, async (delivery) => {
    const endpoint = endpoints.get(delivery.endpointId);
    if (!endpoint || endpoint.disabledAt) {
      await db
        .update(schema.webhookDeliveries)
        .set({
          status: "failed",
          lastError: "endpoint_disabled",
          claimedUntil: null,
          completedAt: now,
        })
        .where(eq(schema.webhookDeliveries.id, delivery.id));
      result.failed += 1;
      return;
    }

    try {
      const attempt = await attemptWebhookDelivery({
        delivery,
        endpoint,
        sender: input?.sender,
        now,
      });
      result.attempted += 1;
      result[attempt.status] += 1;
    } catch {
      // The lease lapses and the next tick tries again.
      logger.error({ webhookDeliveryId: delivery.id }, "outbound webhook attempt crashed");
    }
  });

  return result;
}
