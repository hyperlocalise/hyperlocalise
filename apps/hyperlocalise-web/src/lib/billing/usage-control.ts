import { eq } from "drizzle-orm";

import { env } from "@/lib/env";
import type { DatabaseClient } from "@/lib/database";
import { db, schema } from "@/lib/database";

const AUTUMN_API_VERSION = "2.2.0";
const AUTUMN_TRACK_USAGE_URL = "https://api.useautumn.com/v1/balances.track";

import { usageFeatureIds, type UsageFeatureId } from "@/lib/billing/autumn-ids";

export { usageFeatureIds, type UsageFeatureId };

export async function reserveUsageEvent(input: {
  db?: DatabaseClient;
  organizationId: string;
  featureId: UsageFeatureId;
  operationKey: string;
  source: string;
  quantity?: number;
  jobId?: string;
  interactionId?: string;
}) {
  const database = input.db ?? db;
  const [event] = await database
    .insert(schema.usageEvents)
    .values({
      organizationId: input.organizationId,
      featureId: input.featureId,
      operationKey: input.operationKey,
      source: input.source,
      quantity: input.quantity ?? 1,
      jobId: input.jobId,
      interactionId: input.interactionId,
    })
    .onConflictDoNothing({ target: schema.usageEvents.operationKey })
    .returning({ id: schema.usageEvents.id });

  if (event) return event;

  const [existing] = await database
    .select({ id: schema.usageEvents.id })
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, input.operationKey))
    .limit(1);

  if (existing) return existing;
  throw new Error("failed to reserve usage event");
}

export async function markUsageEventSucceededByOperationKey(input: {
  db?: DatabaseClient;
  operationKey: string;
}) {
  const database = input.db ?? db;
  const [event] = await database
    .update(schema.usageEvents)
    .set({ status: "succeeded", autumnTrackError: null })
    .where(eq(schema.usageEvents.operationKey, input.operationKey))
    .returning({ id: schema.usageEvents.id });

  if (!event) {
    throw new Error(`usage event not found for operation key ${input.operationKey}`);
  }
}

function canTrackUsageEventStatus(status: (typeof schema.usageEvents.$inferSelect)["status"]) {
  return status === "succeeded" || status === "tracking_pending" || status === "tracking_failed";
}

function autumnTrackErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "autumn_tracking_failed";
}

async function trackUsageEventInAutumn(input: {
  event: typeof schema.usageEvents.$inferSelect;
  apiKey: string;
  fetchFn: typeof fetch;
}) {
  const response = await input.fetchFn(AUTUMN_TRACK_USAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "x-api-version": AUTUMN_API_VERSION,
    },
    body: JSON.stringify({
      customer_id: input.event.organizationId,
      feature_id: input.event.featureId,
      value: input.event.quantity,
      idempotency_key: input.event.operationKey,
      properties: {
        operation_key: input.event.operationKey,
        source: input.event.source,
        job_id: input.event.jobId,
        interaction_id: input.event.interactionId,
      },
    }),
  });

  if (response.ok || response.status === 409) return;
  throw new Error(`Autumn usage tracking failed with HTTP ${response.status}`);
}

export async function trackUsageEventInAutumnByOperationKey(input: {
  db?: DatabaseClient;
  operationKey: string;
  autumnApiKey?: string;
  fetchFn?: typeof fetch;
}) {
  const database = input.db ?? db;
  const [event] = await database
    .select()
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, input.operationKey))
    .limit(1);

  if (!event) {
    throw new Error(`usage event not found for operation key ${input.operationKey}`);
  }

  if (event.status === "tracking_succeeded") return;

  if (!canTrackUsageEventStatus(event.status)) {
    throw new Error(
      `usage event ${input.operationKey} must be succeeded before tracking, got ${event.status}`,
    );
  }

  const autumnApiKey = input.autumnApiKey ?? env.AUTUMN_API_KEY;
  if (!autumnApiKey) {
    const [updatedEvent] = await database
      .update(schema.usageEvents)
      .set({ status: "tracking_pending", autumnTrackError: "autumn_not_configured" })
      .where(eq(schema.usageEvents.id, event.id))
      .returning({ id: schema.usageEvents.id });

    if (!updatedEvent) {
      throw new Error(`usage event not found for operation key ${input.operationKey}`);
    }
    return;
  }

  const [pendingEvent] = await database
    .update(schema.usageEvents)
    .set({ status: "tracking_pending", autumnTrackError: null })
    .where(eq(schema.usageEvents.id, event.id))
    .returning({ id: schema.usageEvents.id });

  if (!pendingEvent) {
    throw new Error(`usage event not found for operation key ${input.operationKey}`);
  }

  try {
    await trackUsageEventInAutumn({
      event,
      apiKey: autumnApiKey,
      fetchFn: input.fetchFn ?? fetch,
    });
  } catch (error) {
    const [failedEvent] = await database
      .update(schema.usageEvents)
      .set({ status: "tracking_failed", autumnTrackError: autumnTrackErrorMessage(error) })
      .where(eq(schema.usageEvents.id, event.id))
      .returning({ id: schema.usageEvents.id });

    if (!failedEvent) {
      throw new Error(`usage event not found for operation key ${input.operationKey}`);
    }
    throw error;
  }

  const [trackedEvent] = await database
    .update(schema.usageEvents)
    .set({ status: "tracking_succeeded", autumnTrackedAt: new Date(), autumnTrackError: null })
    .where(eq(schema.usageEvents.id, event.id))
    .returning({ id: schema.usageEvents.id });

  if (!trackedEvent) {
    throw new Error(`usage event not found for operation key ${input.operationKey}`);
  }
}
