import { eq } from "drizzle-orm";

import { usageFeatureIds, type UsageFeatureId } from "@/lib/billing/autumn-ids";
import type { DatabaseClient } from "@/lib/database";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/primitives/result/results";

const AUTUMN_API_VERSION = "2.2.0";
const AUTUMN_TRACK_USAGE_URL = "https://api.useautumn.com/v1/balances.track";

export { usageFeatureIds, type UsageFeatureId };

export type UsageEventReference = {
  id: string;
};

type UsageEventDimensions = Record<string, string | number | boolean | null>;

export type UsageEventNotFoundError = {
  code: "usage_event_not_found";
  operationKey: string;
};

export type ReserveUsageEventError = {
  code: "usage_event_reservation_failed";
  operationKey: string;
};

export type MarkUsageEventSucceededError = UsageEventNotFoundError;

export type TrackUsageEventError =
  | UsageEventNotFoundError
  | {
      code: "usage_event_not_trackable";
      operationKey: string;
      status: (typeof schema.usageEvents.$inferSelect)["status"];
    }
  | {
      code: "autumn_usage_tracking_failed";
      operationKey: string;
      message: string;
      httpStatus?: number;
    };

export type TrackUsageEventResult = {
  status: "already_tracked" | "tracking_pending" | "tracking_succeeded";
};

export type UsageControlError =
  | ReserveUsageEventError
  | MarkUsageEventSucceededError
  | TrackUsageEventError;

export function formatUsageControlError(error: UsageControlError): string {
  switch (error.code) {
    case "usage_event_not_found":
      return `usage event not found for operation key ${error.operationKey}`;
    case "usage_event_reservation_failed":
      return `failed to reserve usage event for operation key ${error.operationKey}`;
    case "usage_event_not_trackable":
      return `usage event ${error.operationKey} must be succeeded before tracking, got ${error.status}`;
    case "autumn_usage_tracking_failed":
      return error.message;
  }
}

export async function reserveUsageEvent(input: {
  db?: DatabaseClient;
  organizationId: string;
  featureId: UsageFeatureId;
  operationKey: string;
  source: string;
  quantity?: number;
  dimensions?: UsageEventDimensions;
  jobId?: string;
  interactionId?: string;
}): Promise<Result<UsageEventReference, ReserveUsageEventError>> {
  const database = input.db ?? db;
  const [event] = await database
    .insert(schema.usageEvents)
    .values({
      organizationId: input.organizationId,
      featureId: input.featureId,
      operationKey: input.operationKey,
      source: input.source,
      quantity: input.quantity ?? 1,
      dimensions: input.dimensions,
      jobId: input.jobId,
      interactionId: input.interactionId,
    })
    .onConflictDoNothing({ target: schema.usageEvents.operationKey })
    .returning({ id: schema.usageEvents.id });

  if (event) return ok(event);

  const [existing] = await database
    .select({ id: schema.usageEvents.id })
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, input.operationKey))
    .limit(1);

  if (existing) return ok(existing);
  return err({ code: "usage_event_reservation_failed", operationKey: input.operationKey });
}

export async function markUsageEventSucceededByOperationKey(input: {
  db?: DatabaseClient;
  operationKey: string;
  quantity?: number;
  dimensions?: UsageEventDimensions;
}): Promise<Result<void, MarkUsageEventSucceededError>> {
  const database = input.db ?? db;
  const updateValues: Partial<typeof schema.usageEvents.$inferInsert> = {
    status: "succeeded",
    autumnTrackError: null,
  };

  if (typeof input.quantity === "number") {
    updateValues.quantity = input.quantity;
  }

  if (input.dimensions) {
    updateValues.dimensions = input.dimensions;
  }

  const [event] = await database
    .update(schema.usageEvents)
    .set(updateValues)
    .where(eq(schema.usageEvents.operationKey, input.operationKey))
    .returning({ id: schema.usageEvents.id });

  if (!event) {
    return err({ code: "usage_event_not_found", operationKey: input.operationKey });
  }

  return ok(undefined);
}

function canTrackUsageEventStatus(status: (typeof schema.usageEvents.$inferSelect)["status"]) {
  return status === "succeeded" || status === "tracking_pending" || status === "tracking_failed";
}

function autumnTrackErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "autumn_tracking_failed";
}

function autumnEventName(event: typeof schema.usageEvents.$inferSelect) {
  const eventName = event.dimensions?.autumn_event_name;
  return typeof eventName === "string" && eventName.trim() ? eventName : null;
}

async function trackUsageEventInAutumn(input: {
  event: typeof schema.usageEvents.$inferSelect;
  apiKey: string;
  fetchFn: typeof fetch;
}): Promise<Result<void, Extract<TrackUsageEventError, { code: "autumn_usage_tracking_failed" }>>> {
  let response: Response;

  try {
    response = await input.fetchFn(AUTUMN_TRACK_USAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        "x-api-version": AUTUMN_API_VERSION,
      },
      body: JSON.stringify({
        customer_id: input.event.organizationId,
        ...(autumnEventName(input.event)
          ? { event_name: autumnEventName(input.event) }
          : { feature_id: input.event.featureId }),
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
  } catch (error) {
    return err({
      code: "autumn_usage_tracking_failed",
      operationKey: input.event.operationKey,
      message: autumnTrackErrorMessage(error),
    });
  }

  if (response.ok || response.status === 409) return ok(undefined);
  return err({
    code: "autumn_usage_tracking_failed",
    operationKey: input.event.operationKey,
    message: `Autumn usage tracking failed with HTTP ${response.status}`,
    httpStatus: response.status,
  });
}

export async function trackUsageEventInAutumnByOperationKey(input: {
  db?: DatabaseClient;
  operationKey: string;
  autumnApiKey?: string;
  fetchFn?: typeof fetch;
}): Promise<Result<TrackUsageEventResult, TrackUsageEventError>> {
  const database = input.db ?? db;
  const [event] = await database
    .select()
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.operationKey, input.operationKey))
    .limit(1);

  if (!event) {
    return err({ code: "usage_event_not_found", operationKey: input.operationKey });
  }

  if (event.status === "tracking_succeeded") return ok({ status: "already_tracked" });

  if (!canTrackUsageEventStatus(event.status)) {
    return err({
      code: "usage_event_not_trackable",
      operationKey: input.operationKey,
      status: event.status,
    });
  }

  const autumnApiKey = input.autumnApiKey ?? env.AUTUMN_API_KEY;
  if (!autumnApiKey) {
    const [updatedEvent] = await database
      .update(schema.usageEvents)
      .set({ status: "tracking_pending", autumnTrackError: "autumn_not_configured" })
      .where(eq(schema.usageEvents.id, event.id))
      .returning({ id: schema.usageEvents.id });

    if (!updatedEvent) {
      return err({ code: "usage_event_not_found", operationKey: input.operationKey });
    }
    return ok({ status: "tracking_pending" });
  }

  const [pendingEvent] = await database
    .update(schema.usageEvents)
    .set({ status: "tracking_pending", autumnTrackError: null })
    .where(eq(schema.usageEvents.id, event.id))
    .returning({ id: schema.usageEvents.id });

  if (!pendingEvent) {
    return err({ code: "usage_event_not_found", operationKey: input.operationKey });
  }

  const trackingResult = await trackUsageEventInAutumn({
    event,
    apiKey: autumnApiKey,
    fetchFn: input.fetchFn ?? fetch,
  });

  if (!trackingResult.ok) {
    const [failedEvent] = await database
      .update(schema.usageEvents)
      .set({ status: "tracking_failed", autumnTrackError: trackingResult.error.message })
      .where(eq(schema.usageEvents.id, event.id))
      .returning({ id: schema.usageEvents.id });

    if (!failedEvent) {
      return err({ code: "usage_event_not_found", operationKey: input.operationKey });
    }
    return err(trackingResult.error);
  }

  const [trackedEvent] = await database
    .update(schema.usageEvents)
    .set({ status: "tracking_succeeded", autumnTrackedAt: new Date(), autumnTrackError: null })
    .where(eq(schema.usageEvents.id, event.id))
    .returning({ id: schema.usageEvents.id });

  if (!trackedEvent) {
    return err({ code: "usage_event_not_found", operationKey: input.operationKey });
  }

  return ok({ status: "tracking_succeeded" });
}
