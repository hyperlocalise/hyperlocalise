import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { createLogger } from "@/lib/log";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { enqueueProviderSyncIntentFromWebhookEvent } from "@/lib/providers/provider-sync-intent-worker";
import {
  findActiveProviderWebhookSubscription,
  insertProviderWebhookEventIdempotent,
  updateProviderWebhookEventProcessingStatus,
  updateProviderWebhookEventSyncIntent,
} from "@/lib/providers/provider-webhook-storage";
import {
  getTmsProviderWebhookAdapter,
  isExecutableTmsWebhookMappedIntent,
  type ProviderWebhookPayload,
  type TmsProviderWebhookAdapter,
  type TmsProviderWebhookDescriptor,
  type TmsWebhookExecutableIntent,
} from "@/lib/providers/tms-provider-webhook-adapters";
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

export type ProviderTmsWebhookVerifier = TmsProviderWebhookAdapter;

type CreateTmsWebhookRoutesOptions = {
  verifier?: ProviderTmsWebhookVerifier;
  providerAdapters?: Partial<Record<ExternalTmsProviderKind, TmsProviderWebhookAdapter>>;
  providerWebhookReconciliationQueue?: ProviderWebhookReconciliationQueue;
};

function isExternalTmsProviderKind(value: string): value is ExternalTmsProviderKind {
  return providerKinds.has(value as ExternalTmsProviderKind);
}

export function createTmsWebhookRoutes(options: CreateTmsWebhookRoutesOptions = {}) {
  const queue =
    options.providerWebhookReconciliationQueue ?? createProviderWebhookReconciliationQueue();

  function adapterFor(providerKind: ExternalTmsProviderKind) {
    return (
      options.verifier ??
      options.providerAdapters?.[providerKind] ??
      getTmsProviderWebhookAdapter(providerKind)
    );
  }

  async function enqueueReconciliation(input: {
    providerWebhookEventId: string;
    organizationId: string;
    subscriptionId: string;
    providerKind: ExternalTmsProviderKind;
    providerCredentialId: string;
    projectId?: string | null;
    descriptor: TmsProviderWebhookDescriptor;
  }) {
    const executableIntents = input.descriptor.mappedIntents.filter(
      isExecutableTmsWebhookMappedIntent,
    );
    if (executableIntents.length === 0) {
      const errorMessage =
        input.descriptor.mappedIntents.length > 0
          ? "unsupported_provider_webhook_event"
          : "unrecognized_provider_webhook_event";

      logger.warn(
        {
          providerKind: input.providerKind,
          subscriptionId: input.subscriptionId,
          providerWebhookEventId: input.providerWebhookEventId,
          eventType: input.descriptor.eventType,
          resourceType: input.descriptor.resourceType ?? null,
          mappedIntentKinds: input.descriptor.mappedIntents.map((intent) => intent.kind),
        },
        "ignoring webhook: unsupported provider event",
      );

      await updateProviderWebhookEventProcessingStatus({
        eventId: input.providerWebhookEventId,
        organizationId: input.organizationId,
        processingStatus: "skipped",
        errorMessage,
        errorDetails: {
          eventType: input.descriptor.eventType,
          resourceType: input.descriptor.resourceType ?? null,
          mappedIntentKinds: input.descriptor.mappedIntents.map((intent) => intent.kind),
        },
      });

      return null;
    }

    const [firstIntent, ...remainingIntents] = executableIntents;
    const primaryProviderSyncIntentId = await enqueueMappedReconciliation({
      ...input,
      mappedIntent: firstIntent,
    });
    for (const mappedIntent of remainingIntents) {
      await enqueueMappedReconciliation({
        ...input,
        mappedIntent,
      });
    }

    await updateProviderWebhookEventSyncIntent({
      eventId: input.providerWebhookEventId,
      organizationId: input.organizationId,
      providerSyncIntentId: primaryProviderSyncIntentId,
    });

    return primaryProviderSyncIntentId;
  }

  async function enqueueMappedReconciliation(input: {
    providerWebhookEventId: string;
    organizationId: string;
    subscriptionId: string;
    providerKind: ExternalTmsProviderKind;
    providerCredentialId: string;
    projectId?: string | null;
    mappedIntent: TmsWebhookExecutableIntent;
  }) {
    const { intent } = await enqueueProviderSyncIntentFromWebhookEvent({
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      providerCredentialId: input.providerCredentialId,
      projectId: input.projectId,
      syncKind: input.mappedIntent.kind,
      providerWebhookEventId: input.providerWebhookEventId,
      resourceId: input.mappedIntent.resourceId,
      resourceIds: input.mappedIntent.resourceIds,
    });

    await queue.enqueue({
      providerWebhookEventId: input.providerWebhookEventId,
      providerSyncIntentId: intent.id,
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      providerKind: input.providerKind,
    } satisfies ProviderWebhookReconciliationEventData);

    return intent.id;
  }

  function remapStoredDescriptor(input: {
    adapter: TmsProviderWebhookAdapter;
    providerKind: ExternalTmsProviderKind;
    headers: Headers;
    redactedPayload: ProviderWebhookPayload;
    descriptor: TmsProviderWebhookDescriptor;
    eventType: string;
    resourceType: string | null;
    resourceId: string | null;
    externalResourceId: string | null;
  }): TmsProviderWebhookDescriptor {
    const descriptor: TmsProviderWebhookDescriptor = {
      ...input.descriptor,
      eventType: input.eventType,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      externalResourceId: input.externalResourceId,
      mappedIntents: [],
      redactedPayload: {},
    };

    descriptor.mappedIntents = input.adapter.mapToIntents({
      providerKind: input.providerKind,
      headers: input.headers,
      payload: input.redactedPayload,
      descriptor,
    });
    descriptor.redactedPayload = input.adapter.redact({
      providerKind: input.providerKind,
      headers: input.headers,
      payload: input.redactedPayload,
      descriptor,
    });

    return descriptor;
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

      const payload = parseResult.value as ProviderWebhookPayload;
      const adapter = adapterFor(providerKindParam);
      const descriptor = adapter.extract({
        providerKind: providerKindParam,
        headers: c.req.raw.headers,
        payload,
        requestUrl: c.req.url,
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

      const verified = await adapter.verify({
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
            descriptor: remapStoredDescriptor({
              adapter,
              providerKind: providerKindParam,
              headers: c.req.raw.headers,
              redactedPayload: stored.event.redactedPayload,
              descriptor,
              eventType: stored.event.eventType,
              resourceType: stored.event.resourceType,
              resourceId: stored.event.resourceId,
              externalResourceId: stored.event.externalResourceId,
            }),
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

          return c.json({ ok: true, ignored: providerSyncIntentId === null, duplicate: true }, 202);
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
        descriptor,
      });

      log.info(
        {
          subscriptionId: subscription.id,
          providerSyncIntentId,
          providerWebhookEventId: stored.event.id,
        },
        providerSyncIntentId
          ? "webhook accepted"
          : "webhook ignored for unrecognized provider event",
      );

      return c.json({ ok: true, ignored: providerSyncIntentId === null }, 202);
    },
  );
}
