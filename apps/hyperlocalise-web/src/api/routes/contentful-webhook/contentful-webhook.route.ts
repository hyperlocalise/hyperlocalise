import { Hono } from "hono";
import { validator } from "hono/validator";

import { badRequestResponse, unauthorizedResponse } from "@/api/response.schema";
import { dispatchWorkspaceAutomationsForContentfulWebhook } from "@/lib/agents/workspace-automation-dispatcher";
import { getContentfulWebhookSubscription } from "@/lib/contentful/connections";
import { recordContentfulWebhookEvent } from "@/lib/contentful/events";
import {
  parseContentfulWebhookPayload,
  readContentfulWebhookSecret,
  verifyContentfulWebhookSecret,
} from "@/lib/contentful/webhook";
import { db, schema } from "@/lib/database";
import type { ContentfulAutomationExecutionQueue } from "@/lib/workflow/types";
import { eq } from "drizzle-orm";

import { contentfulWebhookSubscriptionParamSchema } from "../contentful-connection/contentful-connection.schema";

const validateWebhookParams = validator("param", (value, c) => {
  const parsed = contentfulWebhookSubscriptionParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_contentful_webhook_subscription");
  }
  return parsed.data;
});

export function createContentfulWebhookRoutes(
  options: {
    contentfulAutomationExecutionQueue?: ContentfulAutomationExecutionQueue;
  } = {},
) {
  return new Hono().post("/:subscriptionId", validateWebhookParams, async (c) => {
    const { subscriptionId } = c.req.valid("param");
    const subscription = await getContentfulWebhookSubscription({ subscriptionId });
    if (
      !subscription ||
      !subscription.connection.enabled ||
      subscription.subscription.status !== "active"
    ) {
      return c.json({ ok: true, ignored: true }, 202);
    }

    const providedSecret = readContentfulWebhookSecret(c.req.raw.headers);
    if (
      !verifyContentfulWebhookSecret({
        providedSecret,
        expectedSecretHash: subscription.subscription.secretHash,
      })
    ) {
      return unauthorizedResponse(c, "invalid_contentful_webhook_secret");
    }

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return badRequestResponse(c, "invalid_contentful_webhook_payload");
    }

    const parsedEvent = parseContentfulWebhookPayload({
      body,
      headers: c.req.raw.headers,
    });
    const record = await recordContentfulWebhookEvent({
      organizationId: subscription.subscription.organizationId,
      connectionId: subscription.subscription.connectionId,
      subscriptionId: subscription.subscription.id,
      event: parsedEvent,
    });

    await db
      .update(schema.contentfulWebhookSubscriptions)
      .set({
        lastDeliveryId: parsedEvent.providerEventId,
        lastDeliveredAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.contentfulWebhookSubscriptions.id, subscription.subscription.id));

    if (!record.inserted) {
      return c.json({ ok: true, duplicate: true }, 202);
    }

    const results = await dispatchWorkspaceAutomationsForContentfulWebhook({
      organizationId: subscription.subscription.organizationId,
      connectionId: subscription.subscription.connectionId,
      contentfulWebhookEventId: record.event.id,
      entryId: parsedEvent.entryId,
      contentTypeId: parsedEvent.contentTypeId,
      queue: options.contentfulAutomationExecutionQueue,
    });

    return c.json(
      {
        ok: true,
        eventId: record.event.id,
        dispatched: results.filter((result) => result.outcome === "enqueued").length,
      },
      202,
    );
  });
}
