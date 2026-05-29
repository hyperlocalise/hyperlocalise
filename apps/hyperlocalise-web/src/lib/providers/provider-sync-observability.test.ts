import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/organization-external-tms-provider-credentials";
import { enqueueProviderSyncIntentFromWebhookEvent } from "@/lib/providers/provider-sync-intent-worker";
import { insertProviderWebhookSubscription } from "@/lib/providers/provider-webhook-storage";
import type { ProviderWebhookReconciliationEventData } from "@/lib/workflow/types";

import {
  getProviderSyncObservability,
  ProviderSyncIntentNotRetryableError,
  retryProviderSyncIntent,
} from "./provider-sync-observability";

const createdOrganizationIds = new Set<string>();
const createdUserIds = new Set<string>();

async function createOrganizationUser() {
  const userId = randomUUID();
  const organizationId = randomUUID();

  createdUserIds.add(userId);
  createdOrganizationIds.add(organizationId);

  await db.insert(schema.users).values({
    id: userId,
    workosUserId: `user_${randomUUID()}`,
    email: `test-${userId}@example.com`,
  });
  await db.insert(schema.organizations).values({
    id: organizationId,
    workosOrganizationId: `org_${randomUUID()}`,
    slug: `org-${randomUUID().slice(0, 8)}`,
    name: "Acme",
  });
  await db.insert(schema.organizationMemberships).values({
    organizationId,
    userId,
    role: "owner",
  });

  return { organizationId, userId };
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  const organizationIds = [...createdOrganizationIds];
  const userIds = [...createdUserIds];

  if (organizationIds.length > 0) {
    await db
      .delete(schema.providerSyncRuns)
      .where(inArray(schema.providerSyncRuns.organizationId, organizationIds));
    await db
      .delete(schema.providerSyncIntents)
      .where(inArray(schema.providerSyncIntents.organizationId, organizationIds));
    await db
      .delete(schema.providerWebhookEvents)
      .where(inArray(schema.providerWebhookEvents.organizationId, organizationIds));
    await db
      .delete(schema.providerWebhookSubscriptions)
      .where(inArray(schema.providerWebhookSubscriptions.organizationId, organizationIds));
    await db
      .delete(schema.organizationExternalTmsProviderCredentials)
      .where(
        inArray(schema.organizationExternalTmsProviderCredentials.organizationId, organizationIds),
      );
    await db
      .delete(schema.organizationMemberships)
      .where(inArray(schema.organizationMemberships.organizationId, organizationIds));
    await db.delete(schema.organizations).where(inArray(schema.organizations.id, organizationIds));
  }

  if (userIds.length > 0) {
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
  }

  createdOrganizationIds.clear();
  createdUserIds.clear();
});

describe("provider sync observability", () => {
  it("returns latest subscription, webhook event, intent, and run summaries", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "secret-token",
    });
    const subscription = await insertProviderWebhookSubscription({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      providerWebhookId: "webhook-obs-1",
      endpointUrl: "https://app.example.test/api/webhooks/tms/crowdin",
      webhookSecretPlaintext: "webhook-signing-secret",
      status: "active",
    });

    const [webhookEvent] = await db
      .insert(schema.providerWebhookEvents)
      .values({
        organizationId,
        subscriptionId: subscription.id,
        providerKind: "crowdin",
        providerEventId: "evt-obs-1",
        eventType: "file.updated",
        dedupeKey: "evt-obs-1",
        processingStatus: "failed",
        errorMessage: "provider_sync_run_failed",
      })
      .returning();

    const { intent } = await enqueueProviderSyncIntentFromWebhookEvent({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      syncKind: "file_key_scan",
      providerWebhookEventId: webhookEvent!.id,
    });

    const [run] = await db
      .insert(schema.providerSyncRuns)
      .values({
        organizationId,
        providerKind: "crowdin",
        kind: "file_key_scan",
        status: "failed",
        errorMessage: "provider_sync_run_failed",
      })
      .returning();

    await db
      .update(schema.providerSyncIntents)
      .set({
        status: "failed",
        providerSyncRunId: run!.id,
        lastError: "provider_sync_run_failed",
      })
      .where(eq(schema.providerSyncIntents.id, intent.id));

    const observability = await getProviderSyncObservability({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
    });

    expect(observability.entries).toHaveLength(1);
    expect(observability.entries[0]).toMatchObject({
      automaticSyncActive: true,
      latestWebhookEvent: {
        id: webhookEvent!.id,
        processingStatus: "failed",
      },
      latestSyncIntent: {
        id: intent.id,
        status: "failed",
        canRetry: true,
      },
      latestSyncRun: {
        id: run!.id,
        status: "failed",
      },
    });
  });

  it("requeues a failed intent without creating a duplicate intent row", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "secret-token",
    });
    const subscription = await insertProviderWebhookSubscription({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "phrase",
      providerWebhookId: "phrase-obs-1",
      endpointUrl: "https://app.example.test/api/webhooks/tms/phrase",
      webhookSecretPlaintext: "webhook-signing-secret",
      status: "active",
    });

    const [webhookEvent] = await db
      .insert(schema.providerWebhookEvents)
      .values({
        organizationId,
        subscriptionId: subscription.id,
        providerKind: "phrase",
        providerEventId: "evt-phrase-retry",
        eventType: "uploads:create",
        dedupeKey: "evt-phrase-retry",
        processingStatus: "failed",
      })
      .returning();

    const { intent } = await enqueueProviderSyncIntentFromWebhookEvent({
      organizationId,
      providerKind: "phrase",
      providerCredentialId: credential.id,
      syncKind: "file_key_scan",
      providerWebhookEventId: webhookEvent!.id,
    });

    await db
      .update(schema.providerSyncIntents)
      .set({ status: "failed", lastError: "provider_sync_run_failed" })
      .where(eq(schema.providerSyncIntents.id, intent.id));

    const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
    await retryProviderSyncIntent({
      organizationId,
      providerKind: "phrase",
      intentId: intent.id,
      providerWebhookReconciliationQueue: {
        async enqueue(event) {
          queuedEvents.push(event);
          return { ids: [randomUUID()] };
        },
      },
    });

    const intents = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, organizationId));

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      id: intent.id,
      status: "pending",
    });
    expect(queuedEvents).toHaveLength(1);
    expect(queuedEvents[0]).toMatchObject({
      providerSyncIntentId: intent.id,
      providerWebhookEventId: webhookEvent!.id,
    });
  });

  it("rejects retry for non-retryable intents", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "secret-token",
    });

    const subscription = await insertProviderWebhookSubscription({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      providerWebhookId: "webhook-retry-guard",
      endpointUrl: "https://app.example.test/api/webhooks/tms/crowdin",
      webhookSecretPlaintext: "webhook-signing-secret",
      status: "active",
    });

    const [webhookEvent] = await db
      .insert(schema.providerWebhookEvents)
      .values({
        organizationId,
        subscriptionId: subscription.id,
        providerKind: "crowdin",
        providerEventId: "evt-retry-guard",
        eventType: "file.updated",
        dedupeKey: "evt-retry-guard",
        processingStatus: "pending",
      })
      .returning();

    const { intent } = await enqueueProviderSyncIntentFromWebhookEvent({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      syncKind: "file_key_scan",
      providerWebhookEventId: webhookEvent!.id,
    });

    await expect(
      retryProviderSyncIntent({
        organizationId,
        providerKind: "crowdin",
        intentId: intent.id,
        providerWebhookReconciliationQueue: {
          async enqueue() {
            return { ids: [randomUUID()] };
          },
        },
      }),
    ).rejects.toBeInstanceOf(ProviderSyncIntentNotRetryableError);
  });
});
