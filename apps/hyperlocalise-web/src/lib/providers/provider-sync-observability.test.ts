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
    role: "admin",
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
      role: "admin",
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

  it("keeps global observability scoped to global intents and runs", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "secret-token",
    });

    const projectId = `project_${randomUUID()}`;
    await db.insert(schema.projects).values({
      id: projectId,
      organizationId,
      name: "Crowdin project",
      description: "",
      translationContext: "",
      source: "external_tms",
      externalProviderCredentialId: credential.id,
      externalProviderKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      targetLocales: ["fr"],
      isActive: true,
    });

    await insertProviderWebhookSubscription({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      providerWebhookId: "webhook-global",
      endpointUrl: "https://app.example.test/api/webhooks/tms/crowdin",
      webhookSecretPlaintext: "webhook-signing-secret",
      status: "active",
    });
    await insertProviderWebhookSubscription({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "crowdin",
      providerWebhookId: "webhook-project",
      endpointUrl: "https://app.example.test/api/webhooks/tms/crowdin",
      webhookSecretPlaintext: "webhook-signing-secret",
      status: "active",
      projectId,
    });

    const [globalIntent] = await db
      .insert(schema.providerSyncIntents)
      .values({
        organizationId,
        providerCredentialId: credential.id,
        providerKind: "crowdin",
        syncKind: "file_key_scan",
        cause: "webhook",
        status: "succeeded",
        leaseKey: `global-${randomUUID()}`,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      })
      .returning();

    const [projectRun] = await db
      .insert(schema.providerSyncRuns)
      .values({
        organizationId,
        providerKind: "crowdin",
        kind: "file_key_scan",
        status: "succeeded",
        projectId,
        startedAt: new Date("2026-01-02T00:00:00Z"),
      })
      .returning();

    const [projectIntent] = await db
      .insert(schema.providerSyncIntents)
      .values({
        organizationId,
        providerCredentialId: credential.id,
        providerKind: "crowdin",
        projectId,
        syncKind: "file_key_scan",
        cause: "webhook",
        status: "succeeded",
        providerSyncRunId: projectRun!.id,
        leaseKey: `project-${randomUUID()}`,
        createdAt: new Date("2026-01-02T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      })
      .returning();

    const observability = await getProviderSyncObservability({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
    });

    const globalEntry = observability.entries.find((entry) => entry.projectId === null);
    const projectEntry = observability.entries.find((entry) => entry.projectId === projectId);

    expect(globalEntry?.latestSyncIntent?.id).toBe(globalIntent!.id);
    expect(globalEntry?.latestSyncRun).toBeNull();
    expect(projectEntry?.latestSyncIntent?.id).toBe(projectIntent!.id);
    expect(projectEntry?.latestSyncRun?.id).toBe(projectRun!.id);
  });

  it("requeues a failed intent without creating a duplicate intent row", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
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

  it("restores retryable state when manual retry enqueue fails", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "secret-token",
    });
    const subscription = await insertProviderWebhookSubscription({
      organizationId,
      providerCredentialId: credential.id,
      providerKind: "phrase",
      providerWebhookId: "phrase-obs-enqueue-fails",
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
        providerEventId: "evt-phrase-retry-enqueue-fails",
        eventType: "uploads:create",
        dedupeKey: "evt-phrase-retry-enqueue-fails",
        processingStatus: "failed",
        errorMessage: "provider_sync_run_failed",
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

    await expect(
      retryProviderSyncIntent({
        organizationId,
        providerKind: "phrase",
        intentId: intent.id,
        providerWebhookReconciliationQueue: {
          async enqueue() {
            throw new Error("queue unavailable");
          },
        },
      }),
    ).rejects.toThrow("queue unavailable");

    const [storedIntent] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.id, intent.id));
    expect(storedIntent).toMatchObject({
      status: "failed",
      lastError: "queue unavailable",
      errorDetails: { message: "queue unavailable" },
    });

    const [storedEvent] = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.id, webhookEvent!.id));
    expect(storedEvent).toMatchObject({
      processingStatus: "failed",
      errorMessage: "queue unavailable",
      errorDetails: { message: "queue unavailable" },
    });
  });

  it("rejects retry for non-retryable intents", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
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

  it("does not mutate a failed intent when retry event references are missing", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "secret-token",
    });

    const [intent] = await db
      .insert(schema.providerSyncIntents)
      .values({
        organizationId,
        providerCredentialId: credential.id,
        providerKind: "crowdin",
        syncKind: "file_key_scan",
        cause: "webhook",
        eventReferences: [],
        leaseKey: `missing-event-${randomUUID()}`,
        status: "failed",
        lastError: "provider_sync_run_failed",
      })
      .returning();

    await expect(
      retryProviderSyncIntent({
        organizationId,
        providerKind: "crowdin",
        intentId: intent!.id,
        providerWebhookReconciliationQueue: {
          async enqueue() {
            return { ids: [randomUUID()] };
          },
        },
      }),
    ).rejects.toBeInstanceOf(ProviderSyncIntentNotRetryableError);

    const [storedIntent] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.id, intent!.id));
    expect(storedIntent).toMatchObject({
      status: "failed",
      lastError: "provider_sync_run_failed",
    });
  });

  it("does not mutate a failed intent when retry webhook event is missing", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "secret-token",
    });

    const [intent] = await db
      .insert(schema.providerSyncIntents)
      .values({
        organizationId,
        providerCredentialId: credential.id,
        providerKind: "crowdin",
        syncKind: "file_key_scan",
        cause: "webhook",
        eventReferences: [randomUUID()],
        leaseKey: `deleted-event-${randomUUID()}`,
        status: "failed",
        lastError: "provider_sync_run_failed",
      })
      .returning();

    await expect(
      retryProviderSyncIntent({
        organizationId,
        providerKind: "crowdin",
        intentId: intent!.id,
        providerWebhookReconciliationQueue: {
          async enqueue() {
            return { ids: [randomUUID()] };
          },
        },
      }),
    ).rejects.toBeInstanceOf(ProviderSyncIntentNotRetryableError);

    const [storedIntent] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.id, intent!.id));
    expect(storedIntent).toMatchObject({
      status: "failed",
      lastError: "provider_sync_run_failed",
    });
  });
});
