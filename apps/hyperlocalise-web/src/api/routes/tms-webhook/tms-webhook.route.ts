import { createHmac, timingSafeEqual } from "node:crypto";

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { createLogger } from "@/lib/log";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { enqueueProviderSyncIntentFromWebhookEvent } from "@/lib/providers/provider-sync-intent-worker";
import { resolveSyncKindFromWebhookEvent } from "@/lib/providers/provider-webhook-sync-mapping";
import {
  findActiveProviderWebhookSubscription,
  insertProviderWebhookEventIdempotent,
  updateProviderWebhookEventProcessingStatus,
  updateProviderWebhookEventSyncIntent,
} from "@/lib/providers/provider-webhook-storage";
import type {
  ProviderWebhookReconciliationEventData,
  ProviderWebhookReconciliationQueue,
} from "@/lib/workflow/types";
import { createProviderWebhookReconciliationQueue } from "@/workflows/adapters";

const logger = createLogger("tms-webhook");

const providerKinds = new Set<ExternalTmsProviderKind>([
  "crowdin",
  "smartling",
  "phrase",
  "lokalise",
]);

type WebhookPayload = Record<string, unknown>;

type ProviderWebhookDescriptor = {
  providerWebhookId: string;
  providerEventId: string;
  eventType: string;
  dedupeKey: string;
  deliveryId: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  externalResourceId?: string | null;
  redactedPayload?: Record<string, unknown>;
};

export type ProviderTmsWebhookVerifier = {
  extract(input: {
    providerKind: ExternalTmsProviderKind;
    headers: Headers;
    payload: WebhookPayload;
  }): ProviderWebhookDescriptor | null;
  verify(input: {
    providerKind: ExternalTmsProviderKind;
    headers: Headers;
    rawBody: string;
    payload: WebhookPayload;
    webhookSecret: string | null;
    descriptor: ProviderWebhookDescriptor;
  }): boolean | Promise<boolean>;
};

type CreateTmsWebhookRoutesOptions = {
  verifier?: ProviderTmsWebhookVerifier;
  providerWebhookReconciliationQueue?: ProviderWebhookReconciliationQueue;
};

function isExternalTmsProviderKind(value: string): value is ExternalTmsProviderKind {
  return providerKinds.has(value as ExternalTmsProviderKind);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function readSignature(headers: Headers) {
  const signature =
    headers.get("x-hyperlocalise-signature-256") ?? headers.get("x-provider-signature-256");

  if (!signature) {
    return null;
  }

  return signature.startsWith("sha256=") ? signature.slice("sha256=".length) : signature;
}

function verifyHmacSha256(input: { rawBody: string; webhookSecret: string; signature: string }) {
  const expected = createHmac("sha256", input.webhookSecret).update(input.rawBody).digest("hex");

  if (input.signature.length !== expected.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(input.signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

const defaultVerifier: ProviderTmsWebhookVerifier = {
  extract({ headers, payload }) {
    const providerWebhookId = firstString(
      headers.get("x-hyperlocalise-provider-webhook-id"),
      headers.get("x-provider-webhook-id"),
      payload["provider_webhook_id"],
      payload["webhook_id"],
    );
    const providerEventId = firstString(
      headers.get("x-hyperlocalise-provider-event-id"),
      headers.get("x-provider-event-id"),
      headers.get("x-webhook-event-id"),
      payload["provider_event_id"],
      payload["event_id"],
      payload["id"],
    );
    const deliveryId = firstString(
      headers.get("x-hyperlocalise-delivery-id"),
      headers.get("x-provider-delivery-id"),
      headers.get("x-delivery-id"),
      payload["delivery_id"],
    );
    const eventType = firstString(
      headers.get("x-provider-event-type"),
      payload["event_type"],
      payload["event"],
      payload["type"],
    );

    if (!providerWebhookId || !providerEventId || !eventType) {
      return null;
    }

    const resourceType = firstString(payload["resource_type"], payload["resource"]);
    const resourceId = firstString(payload["resource_id"]);
    const externalResourceId = firstString(payload["external_resource_id"]);

    return {
      providerWebhookId,
      providerEventId,
      eventType,
      dedupeKey: firstString(payload["dedupe_key"], providerEventId) ?? providerEventId,
      deliveryId,
      resourceType,
      resourceId,
      externalResourceId,
      redactedPayload: {
        providerEventId,
        deliveryId,
        eventType,
        resourceType,
        resourceId,
        externalResourceId,
      },
    };
  },
  verify({ headers, rawBody, webhookSecret }) {
    if (!webhookSecret) {
      return true;
    }

    const signature = readSignature(headers);
    if (!signature) {
      return false;
    }

    return verifyHmacSha256({ rawBody, webhookSecret, signature });
  },
};

export function createTmsWebhookRoutes(options: CreateTmsWebhookRoutesOptions = {}) {
  const verifier = options.verifier ?? defaultVerifier;
  const queue =
    options.providerWebhookReconciliationQueue ?? createProviderWebhookReconciliationQueue();

  async function enqueueReconciliation(input: {
    providerWebhookEventId: string;
    organizationId: string;
    subscriptionId: string;
    providerKind: ExternalTmsProviderKind;
    providerCredentialId: string;
    projectId?: string | null;
    eventType: string;
    resourceType?: string | null;
    resourceId?: string | null;
  }) {
    const syncKind = resolveSyncKindFromWebhookEvent({
      eventType: input.eventType,
      resourceType: input.resourceType,
    });

    if (syncKind === "unknown") {
      logger.warn(
        {
          providerKind: input.providerKind,
          subscriptionId: input.subscriptionId,
          providerWebhookEventId: input.providerWebhookEventId,
          eventType: input.eventType,
          resourceType: input.resourceType ?? null,
        },
        "ignoring webhook: unrecognized provider event",
      );

      await updateProviderWebhookEventProcessingStatus({
        eventId: input.providerWebhookEventId,
        organizationId: input.organizationId,
        processingStatus: "skipped",
        errorMessage: "unrecognized_provider_webhook_event",
        errorDetails: {
          eventType: input.eventType,
          resourceType: input.resourceType ?? null,
        },
      });

      return null;
    }

    const { intent } = await enqueueProviderSyncIntentFromWebhookEvent({
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      providerCredentialId: input.providerCredentialId,
      projectId: input.projectId,
      syncKind,
      providerWebhookEventId: input.providerWebhookEventId,
      resourceId: input.resourceId,
    });

    await queue.enqueue({
      providerWebhookEventId: input.providerWebhookEventId,
      providerSyncIntentId: intent.id,
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      providerKind: input.providerKind,
    } satisfies ProviderWebhookReconciliationEventData);

    await updateProviderWebhookEventSyncIntent({
      eventId: input.providerWebhookEventId,
      organizationId: input.organizationId,
      providerSyncIntentId: intent.id,
    });

    return intent.id;
  }

  return new Hono().post(
    "/:providerKind",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
    async (c) => {
      const providerKindParam = c.req.param("providerKind");
      if (!isExternalTmsProviderKind(providerKindParam)) {
        return c.json({ error: "unsupported_provider_kind" }, 404);
      }

      const rawBody = await c.req.text();
      const parseResult = safeJsonParse(rawBody);
      if (!parseResult.ok || typeof parseResult.value !== "object" || parseResult.value === null) {
        return c.json({ error: "invalid_payload" }, 400);
      }

      const payload = parseResult.value as WebhookPayload;
      const descriptor = verifier.extract({
        providerKind: providerKindParam,
        headers: c.req.raw.headers,
        payload,
      });
      if (!descriptor) {
        logger.info({ providerKind: providerKindParam }, "ignoring webhook: missing identifiers");
        return c.json({ ok: true, ignored: true }, 202);
      }

      const log = logger.child({
        providerKind: providerKindParam,
        providerEventId: descriptor.providerEventId,
        deliveryId: descriptor.deliveryId,
      });

      const subscription = await findActiveProviderWebhookSubscription({
        providerKind: providerKindParam,
        providerWebhookId: descriptor.providerWebhookId,
      });
      if (!subscription) {
        log.info("ignoring webhook: subscription not found");
        return c.json({ ok: true, ignored: true }, 202);
      }
      if (!subscription.webhookSecretPlaintext) {
        log.error({ subscriptionId: subscription.id }, "webhook secret unavailable");
        return c.json({ error: "webhook_secret_unavailable" }, 500);
      }

      const verified = await verifier.verify({
        providerKind: providerKindParam,
        headers: c.req.raw.headers,
        rawBody,
        payload,
        webhookSecret: subscription.webhookSecretPlaintext,
        descriptor,
      });
      if (!verified) {
        log.warn({ subscriptionId: subscription.id }, "invalid webhook signature");
        return c.json({ error: "invalid_signature" }, 401);
      }

      const stored = await insertProviderWebhookEventIdempotent({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        providerKind: providerKindParam,
        providerEventId: descriptor.providerEventId,
        eventType: descriptor.eventType,
        dedupeKey: descriptor.dedupeKey,
        projectId: subscription.projectId,
        resourceType: descriptor.resourceType,
        resourceId: descriptor.resourceId,
        externalResourceId: descriptor.externalResourceId,
        redactedPayload: descriptor.redactedPayload,
      });

      if (!stored.inserted || !stored.event) {
        if (
          stored.event?.processingStatus === "pending" &&
          stored.event.providerSyncIntentId === null
        ) {
          const providerSyncIntentId = await enqueueReconciliation({
            providerWebhookEventId: stored.event.id,
            organizationId: subscription.organizationId,
            subscriptionId: subscription.id,
            providerKind: providerKindParam,
            providerCredentialId: subscription.providerCredentialId,
            projectId: subscription.projectId,
            eventType: stored.event.eventType,
            resourceType: stored.event.resourceType,
            resourceId: stored.event.resourceId,
          });

          log.info(
            {
              subscriptionId: subscription.id,
              providerSyncIntentId,
              providerWebhookEventId: stored.event.id,
            },
            providerSyncIntentId
              ? "webhook reconciliation requeued for pending duplicate"
              : "webhook duplicate ignored for unrecognized provider event",
          );

          return c.json(
            { ok: true, ignored: providerSyncIntentId === null, duplicate: true },
            202,
          );
        }

        log.info({ subscriptionId: subscription.id }, "ignoring duplicate webhook delivery");
        return c.json({ ok: true, ignored: true, duplicate: true }, 200);
      }

      const providerSyncIntentId = await enqueueReconciliation({
        providerWebhookEventId: stored.event.id,
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        providerKind: providerKindParam,
        providerCredentialId: subscription.providerCredentialId,
        projectId: subscription.projectId,
        eventType: descriptor.eventType,
        resourceType: descriptor.resourceType,
        resourceId: descriptor.resourceId,
      });

      log.info(
        {
          subscriptionId: subscription.id,
          providerSyncIntentId,
          providerWebhookEventId: stored.event.id,
        },
        providerSyncIntentId ? "webhook accepted" : "webhook ignored for unrecognized provider event",
      );

      return c.json({ ok: true, ignored: providerSyncIntentId === null }, 202);
    },
  );
}
