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
