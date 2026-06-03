import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { createLogger } from "@/lib/log";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import {
  logIntentEnqueued,
  logWebhookAccepted,
  logWebhookDuplicate,
  logWebhookIgnored,
  logWebhookVerificationFailed,
} from "@/lib/providers/provider-tms-sync-telemetry";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { isTmsBackgroundSyncEnabled } from "@/lib/providers/tms-provider-shell-mode";
import { enqueueProviderSyncIntentFromWebhookEvent } from "@/lib/providers/sync/provider-sync-intent-worker";
import { readTmsWebhookSubscriptionIdFromRequestUrl } from "@/lib/providers/webhooks/provider-webhook-public-url";
import {
  findActiveProviderWebhookSubscription,
  findActiveProviderWebhookSubscriptionById,
  insertProviderWebhookEventIdempotent,
  updateProviderWebhookEventProcessingStatus,
} from "@/lib/providers/webhooks/provider-webhook-storage";
import {
  getTmsProviderWebhookAdapter,
  isExecutableTmsWebhookMappedIntent,
  type ProviderWebhookPayload,
  type TmsProviderWebhookAdapter,
  type TmsProviderWebhookDescriptor,
  type TmsWebhookExecutableIntent,
} from "@/lib/providers/webhooks/tms-provider-webhook-adapters";
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

type EnqueuedMappedIntentRecord = {
  key: string;
  providerSyncIntentId: string;
};

function isExternalTmsProviderKind(value: string): value is ExternalTmsProviderKind {
  return providerKinds.has(value as ExternalTmsProviderKind);
}

function mappedIntentQueueKey(intent: TmsWebhookExecutableIntent) {
  return JSON.stringify({
    kind: intent.kind,
    resourceId: intent.resourceId ?? null,
    resourceIds: intent.resourceIds ?? [],
  });
}

function enqueuedMappedIntentRecords(
  errorDetails: Record<string, unknown>,
): EnqueuedMappedIntentRecord[] {
  const records = errorDetails.enqueuedMappedIntents;
  if (!Array.isArray(records)) {
    return [];
  }

  return records.filter(
    (record): record is EnqueuedMappedIntentRecord =>
      typeof record === "object" &&
      record !== null &&
      "key" in record &&
      "providerSyncIntentId" in record &&
      typeof record.key === "string" &&
      typeof record.providerSyncIntentId === "string",
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "provider_webhook_reconciliation_enqueue_failed";
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
    enqueuedMappedIntents?: EnqueuedMappedIntentRecord[];
  }) {
    const executableIntents = input.descriptor.mappedIntents.filter(
      isExecutableTmsWebhookMappedIntent,
    );
    if (executableIntents.length === 0) {
      const errorMessage =
        input.descriptor.mappedIntents.length > 0
          ? "unsupported_provider_webhook_event"
          : "unrecognized_provider_webhook_event";

      logWebhookIgnored({
        providerKind: input.providerKind,
        organizationId: input.organizationId,
        subscriptionId: input.subscriptionId,
        providerWebhookEventId: input.providerWebhookEventId,
        eventType: input.descriptor.eventType,
        reason: errorMessage,
      });

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

    const enqueuedMappedIntents = [...(input.enqueuedMappedIntents ?? [])];
    const enqueuedIntentByKey = new Map(
      enqueuedMappedIntents.map((record) => [record.key, record.providerSyncIntentId]),
    );
    let primaryProviderSyncIntentId: string | null = null;

    try {
      for (const mappedIntent of executableIntents) {
        const key = mappedIntentQueueKey(mappedIntent);
        const existingIntentId = enqueuedIntentByKey.get(key);
        if (existingIntentId) {
          primaryProviderSyncIntentId ??= existingIntentId;
          continue;
        }

        const providerSyncIntentId = await enqueueMappedReconciliation({
          ...input,
          mappedIntent,
        });
        primaryProviderSyncIntentId ??= providerSyncIntentId;

        logIntentEnqueued({
          providerKind: input.providerKind,
          organizationId: input.organizationId,
          subscriptionId: input.subscriptionId,
          providerWebhookEventId: input.providerWebhookEventId,
          providerSyncIntentId,
          syncKind: mappedIntent.kind,
        });

        const record = { key, providerSyncIntentId };
        enqueuedMappedIntents.push(record);
        enqueuedIntentByKey.set(key, providerSyncIntentId);

        await updateProviderWebhookEventProcessingStatus({
          eventId: input.providerWebhookEventId,
          organizationId: input.organizationId,
          processingStatus: "pending",
          errorDetails: { enqueuedMappedIntents },
        });
      }
    } catch (error) {
      await updateProviderWebhookEventProcessingStatus({
        eventId: input.providerWebhookEventId,
        organizationId: input.organizationId,
        processingStatus: "failed",
        errorMessage: "provider_webhook_reconciliation_enqueue_failed",
        errorDetails: {
          message: errorMessage(error),
          enqueuedMappedIntents,
        },
      });
      throw error;
    }

    if (!primaryProviderSyncIntentId) {
      throw new Error("provider_webhook_reconciliation_enqueue_failed");
    }

    await updateProviderWebhookEventProcessingStatus({
      eventId: input.providerWebhookEventId,
      organizationId: input.organizationId,
      processingStatus: "pending",
      providerSyncIntentId: primaryProviderSyncIntentId,
      errorDetails: {},
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

      if (!isTmsBackgroundSyncEnabled()) {
        logWebhookIgnored({
          providerKind: providerKindParam,
          reason: "tms_provider_shell_mode",
        });
        return c.json({ ok: true, ignored: true, reason: "tms_provider_shell_mode" }, 202);
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
        logWebhookIgnored({
          providerKind: providerKindParam,
          reason: "missing_identifiers",
        });
        return c.json({ ok: true, ignored: true }, 202);
      }

      const log = logger.child({
        providerKind: providerKindParam,
        providerEventId: descriptor.providerEventId,
        deliveryId: descriptor.deliveryId,
      });

      const subscriptionId = readTmsWebhookSubscriptionIdFromRequestUrl(c.req.url);
      const subscription = subscriptionId
        ? await findActiveProviderWebhookSubscriptionById({
            subscriptionId,
            providerKind: providerKindParam,
          })
        : await findActiveProviderWebhookSubscription({
            providerKind: providerKindParam,
            providerWebhookId: descriptor.providerWebhookId,
          });
      if (!subscription) {
        logWebhookIgnored({
          providerKind: providerKindParam,
          reason: "subscription_not_found",
        });
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
        logWebhookVerificationFailed({
          providerKind: providerKindParam,
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
        });
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
          (stored.event?.processingStatus === "pending" ||
            stored.event?.processingStatus === "failed") &&
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
            enqueuedMappedIntents: enqueuedMappedIntentRecords(stored.event.errorDetails),
          });

          if (providerSyncIntentId) {
            logWebhookDuplicate({
              providerKind: providerKindParam,
              organizationId: subscription.organizationId,
              subscriptionId: subscription.id,
              providerWebhookEventId: stored.event.id,
              providerSyncIntentId,
              providerEventId: descriptor.providerEventId,
              deliveryId: descriptor.deliveryId,
              reason: "requeued_pending_duplicate",
            });
          } else {
            logWebhookIgnored({
              providerKind: providerKindParam,
              organizationId: subscription.organizationId,
              subscriptionId: subscription.id,
              providerWebhookEventId: stored.event.id,
              providerEventId: descriptor.providerEventId,
              deliveryId: descriptor.deliveryId,
              reason: "duplicate_unrecognized_event",
            });
          }

          return c.json({ ok: true, ignored: providerSyncIntentId === null, duplicate: true }, 202);
        }

        logWebhookDuplicate({
          providerKind: providerKindParam,
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          providerWebhookEventId: stored.event?.id,
          providerEventId: descriptor.providerEventId,
          deliveryId: descriptor.deliveryId,
        });
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

      if (providerSyncIntentId) {
        logWebhookAccepted({
          providerKind: providerKindParam,
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          providerWebhookEventId: stored.event.id,
          providerSyncIntentId,
          providerEventId: descriptor.providerEventId,
          deliveryId: descriptor.deliveryId,
          eventType: descriptor.eventType,
        });
      } else {
        logWebhookIgnored({
          providerKind: providerKindParam,
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          providerWebhookEventId: stored.event.id,
          providerEventId: descriptor.providerEventId,
          deliveryId: descriptor.deliveryId,
          eventType: descriptor.eventType,
          reason: "unrecognized_provider_event",
        });
      }

      return c.json({ ok: true, ignored: providerSyncIntentId === null }, 202);
    },
  );
}
