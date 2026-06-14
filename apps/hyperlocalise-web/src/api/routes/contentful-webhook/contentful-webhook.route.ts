import { Hono } from "hono";
import { validator } from "hono/validator";

import { badRequestResponse, unauthorizedResponse } from "@/api/response.schema";
import { dispatchWorkspaceAutomationsForContentfulWebhook } from "@/lib/agents/workspace-automation-dispatcher";
import { getContentfulWebhookSubscription } from "@/lib/contentful/connections";
import {
  isContentfulPublishFromRecentHyperlocaliseWriteback,
  recordContentfulWebhookEvent,
} from "@/lib/contentful/events";
import {
  parseContentfulWebhookPayload,
  readContentfulWebhookSecret,
  shouldDispatchContentfulWebhookEvent,
  verifyContentfulWebhookSecret,
} from "@/lib/contentful/webhook";
import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
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

const logger = createLogger("contentful-webhook");

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
      logger.info(
        {
          subscriptionId,
          subscriptionFound: Boolean(subscription),
          connectionEnabled: subscription?.connection.enabled ?? null,
          subscriptionStatus: subscription?.subscription.status ?? null,
        },
        "contentful webhook ignored because subscription is unavailable",
      );
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
      logger.warn(
        {
          subscriptionId: subscription.subscription.id,
          organizationId: subscription.subscription.organizationId,
        },
        "contentful webhook rejected invalid payload",
      );
      return badRequestResponse(c, "invalid_contentful_webhook_payload");
    }

    const parsedEvent = parseContentfulWebhookPayload({
      body,
      headers: c.req.raw.headers,
    });
    if (!shouldDispatchContentfulWebhookEvent(parsedEvent)) {
      logger.info(
        {
          subscriptionId: subscription.subscription.id,
          organizationId: subscription.subscription.organizationId,
          eventType: parsedEvent.eventType,
          hasEntryId: Boolean(parsedEvent.entryId),
          hasContentTypeId: Boolean(parsedEvent.contentTypeId),
        },
        "contentful webhook ignored unsupported event type",
      );
      return c.json(
        {
          ok: true,
          ignored: true,
          eventType: parsedEvent.eventType,
        },
        202,
      );
    }

    if (
      parsedEvent.entryId &&
      (await isContentfulPublishFromRecentHyperlocaliseWriteback({
        organizationId: subscription.subscription.organizationId,
        connectionId: subscription.subscription.connectionId,
        entryId: parsedEvent.entryId,
        publishedVersion: parsedEvent.publishedVersion,
      }))
    ) {
      logger.info(
        {
          subscriptionId: subscription.subscription.id,
          organizationId: subscription.subscription.organizationId,
          eventType: parsedEvent.eventType,
          hasContentTypeId: Boolean(parsedEvent.contentTypeId),
          publishedVersion: parsedEvent.publishedVersion,
        },
        "contentful webhook ignored recent hyperlocalise writeback",
      );
      return c.json(
        {
          ok: true,
          ignored: true,
          eventType: parsedEvent.eventType,
          reason: "hyperlocalise_writeback_loop",
        },
        202,
      );
    }

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
      logger.info(
        {
          subscriptionId: subscription.subscription.id,
          organizationId: subscription.subscription.organizationId,
          eventId: record.event.id,
          eventType: parsedEvent.eventType,
        },
        "contentful webhook ignored duplicate delivery",
      );
      return c.json({ ok: true, duplicate: true }, 202);
    }

    logger.info(
      {
        subscriptionId: subscription.subscription.id,
        organizationId: subscription.subscription.organizationId,
        eventId: record.event.id,
        eventType: parsedEvent.eventType,
        hasEntryId: Boolean(parsedEvent.entryId),
        hasContentTypeId: Boolean(parsedEvent.contentTypeId),
      },
      "contentful webhook dispatch started",
    );

    const results = await dispatchWorkspaceAutomationsForContentfulWebhook({
      organizationId: subscription.subscription.organizationId,
      connectionId: subscription.subscription.connectionId,
      contentfulWebhookEventId: record.event.id,
      entryId: parsedEvent.entryId,
      contentTypeId: parsedEvent.contentTypeId,
      queue: options.contentfulAutomationExecutionQueue,
    });
    const enqueued = results.filter((result) => result.outcome === "enqueued").length;
    const skipped = results.filter((result) => result.outcome === "skipped").length;

    logger.info(
      {
        subscriptionId: subscription.subscription.id,
        organizationId: subscription.subscription.organizationId,
        eventId: record.event.id,
        resultCount: results.length,
        enqueued,
        skipped,
      },
      "contentful webhook dispatch completed",
    );

    return c.json(
      {
        ok: true,
        eventId: record.event.id,
        dispatched: enqueued,
      },
      202,
    );
  });
}
