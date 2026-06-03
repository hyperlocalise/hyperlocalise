import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import type { ContentfulWebhookEvent } from "./types";

export async function recordContentfulWebhookEvent(input: {
  organizationId: string;
  connectionId: string;
  subscriptionId: string;
  event: ContentfulWebhookEvent;
}) {
  const [row] = await db
    .insert(schema.contentfulWebhookEvents)
    .values({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      subscriptionId: input.subscriptionId,
      providerEventId: input.event.providerEventId,
      dedupeKey: input.event.dedupeKey,
      eventType: input.event.eventType,
      entryId: input.event.entryId,
      contentTypeId: input.event.contentTypeId,
      revision: input.event.revision,
      redactedPayload: input.event.redactedPayload,
      processingStatus: "pending",
    })
    .onConflictDoNothing({
      target: [
        schema.contentfulWebhookEvents.subscriptionId,
        schema.contentfulWebhookEvents.dedupeKey,
      ],
    })
    .returning();

  if (row) {
    return { event: row, inserted: true };
  }

  const [existing] = await db
    .select()
    .from(schema.contentfulWebhookEvents)
    .where(
      and(
        eq(schema.contentfulWebhookEvents.subscriptionId, input.subscriptionId),
        eq(schema.contentfulWebhookEvents.dedupeKey, input.event.dedupeKey),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("contentful_webhook_event_record_failed");
  }

  return { event: existing, inserted: false };
}

const CONTENTFUL_TRANSLATION_RUN_IN_PROGRESS_STATUSES = new Set(["queued", "running"]);

export function resolveAggregatedContentfulWebhookProcessingStatus(runStatuses: string[]) {
  if (runStatuses.length === 0) {
    return null;
  }
  if (runStatuses.some((status) => CONTENTFUL_TRANSLATION_RUN_IN_PROGRESS_STATUSES.has(status))) {
    return null;
  }
  if (runStatuses.some((status) => status === "failed")) {
    return "failed";
  }
  return "succeeded";
}

export async function markContentfulWebhookEventStatus(input: {
  eventId: string;
  organizationId: string;
  processingStatus: string;
  error?: Record<string, unknown> | null;
}) {
  await db
    .update(schema.contentfulWebhookEvents)
    .set({
      processingStatus: input.processingStatus,
      ...(input.error !== undefined ? { error: input.error } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.contentfulWebhookEvents.id, input.eventId),
        eq(schema.contentfulWebhookEvents.organizationId, input.organizationId),
      ),
    );
}

/**
 * Sets webhook event status only after every translation run for the event has
 * finished. Failed wins over succeeded when sibling automations disagree.
 */
export async function syncContentfulWebhookEventStatus(input: {
  eventId: string;
  organizationId: string;
  error?: Record<string, unknown> | null;
}) {
  const runs = await db
    .select({ status: schema.contentfulTranslationRuns.status })
    .from(schema.contentfulTranslationRuns)
    .where(
      and(
        eq(schema.contentfulTranslationRuns.webhookEventId, input.eventId),
        eq(schema.contentfulTranslationRuns.organizationId, input.organizationId),
      ),
    );

  const processingStatus = resolveAggregatedContentfulWebhookProcessingStatus(
    runs.map((run) => run.status),
  );
  if (!processingStatus) {
    return;
  }

  await markContentfulWebhookEventStatus({
    eventId: input.eventId,
    organizationId: input.organizationId,
    processingStatus,
    ...(processingStatus === "failed" && input.error !== undefined
      ? { error: input.error }
      : processingStatus === "succeeded"
        ? { error: null }
        : {}),
  });
}
