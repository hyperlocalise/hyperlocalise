import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";
import {
  insertProviderWebhookEventIdempotent,
  insertProviderWebhookSubscription,
  updateProviderWebhookEventProcessingStatus,
  updateProviderWebhookSubscriptionStatus,
} from "./provider-webhook-storage";
import { startProviderSyncRun } from "./provider-sync-runs";

describe("provider webhook storage", () => {
  const createdRecordsByTest = new Map<
    string,
    { organizationIds: Set<string>; userIds: Set<string> }
  >();

  function currentTestKey() {
    return expect.getState().currentTestName ?? "__provider_webhook_storage_default__";
  }

  function currentTestRecords() {
    const testKey = currentTestKey();
    const existing = createdRecordsByTest.get(testKey);

    if (existing) {
      return existing;
    }

    const records = {
      organizationIds: new Set<string>(),
      userIds: new Set<string>(),
    };
    createdRecordsByTest.set(testKey, records);

    return records;
  }

  async function createOrganizationUser() {
    const userId = randomUUID();
    const organizationId = randomUUID();
    const records = currentTestRecords();

    records.userIds.add(userId);
    records.organizationIds.add(organizationId);

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

  async function createSubscriptionFixture() {
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
      providerWebhookId: "crowdin-webhook-1",
      endpointUrl: "https://app.example.test/api/webhooks/tms/crowdin",
      subscribedEvents: ["file.translated", "project.created"],
      webhookSecretPlaintext: "signing-secret",
      secretMetadata: { maskedSecretSuffix: "cret" },
    });

    return { organizationId, credential, subscription };
  }

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    const testKey = currentTestKey();
    const records = createdRecordsByTest.get(testKey);

    if (!records) {
      return;
    }

    const organizationIds = [...records.organizationIds];
    const userIds = [...records.userIds];

    if (organizationIds.length > 0) {
      await db
        .delete(schema.providerWebhookEvents)
        .where(inArray(schema.providerWebhookEvents.organizationId, organizationIds));
      await db
        .delete(schema.providerWebhookSubscriptions)
        .where(inArray(schema.providerWebhookSubscriptions.organizationId, organizationIds));
      await db
        .delete(schema.providerSyncRuns)
        .where(inArray(schema.providerSyncRuns.organizationId, organizationIds));
      await db
        .delete(schema.organizationExternalTmsProviderCredentials)
        .where(
          inArray(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            organizationIds,
          ),
        );
      await db
        .delete(schema.organizationMemberships)
        .where(inArray(schema.organizationMemberships.organizationId, organizationIds));
      await db
        .delete(schema.organizations)
        .where(inArray(schema.organizations.id, organizationIds));
    }

    if (userIds.length > 0) {
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }

    createdRecordsByTest.delete(testKey);
  });

  it("inserts webhook subscriptions with encrypted secret material", async () => {
    const { organizationId, subscription } = await createSubscriptionFixture();

    expect(subscription.organizationId).toBe(organizationId);
    expect(subscription.status).toBe("active");
    expect(subscription.subscribedEvents).toEqual(["file.translated", "project.created"]);
    expect(subscription.secretMetadata).toEqual({ maskedSecretSuffix: "cret" });
    expect(subscription.webhookSecretCiphertext).toBeTruthy();
    expect(subscription.webhookSecretIv).toBeTruthy();
    expect(subscription.webhookSecretAuthTag).toBeTruthy();
  });

  it("transitions subscription status and records last error", async () => {
    const { organizationId, subscription } = await createSubscriptionFixture();

    const disabled = await updateProviderWebhookSubscriptionStatus({
      subscriptionId: subscription.id,
      organizationId,
      status: "disabled",
    });
    expect(disabled.status).toBe("disabled");
    expect(disabled.lastError).toBeNull();

    const errored = await updateProviderWebhookSubscriptionStatus({
      subscriptionId: subscription.id,
      organizationId,
      status: "error",
      lastError: "Crowdin rejected webhook update",
    });
    expect(errored.status).toBe("error");
    expect(errored.lastError).toBe("Crowdin rejected webhook update");
    expect(errored.lastErrorAt).toBeTruthy();

    const errorWithoutMessage = await updateProviderWebhookSubscriptionStatus({
      subscriptionId: subscription.id,
      organizationId,
      status: "error",
    });
    expect(errorWithoutMessage.status).toBe("error");
    expect(errorWithoutMessage.lastError).toBe("Crowdin rejected webhook update");
    expect(errorWithoutMessage.lastErrorAt).toBeTruthy();

    const reactivated = await updateProviderWebhookSubscriptionStatus({
      subscriptionId: subscription.id,
      organizationId,
      status: "active",
      lastError: null,
    });
    expect(reactivated.status).toBe("active");
    expect(reactivated.lastError).toBeNull();
    expect(reactivated.lastErrorAt).toBeNull();
  });

  it("dedupes provider events per subscription and dedupe key", async () => {
    const { organizationId, subscription } = await createSubscriptionFixture();

    const first = await insertProviderWebhookEventIdempotent({
      organizationId,
      subscriptionId: subscription.id,
      providerKind: "crowdin",
      providerEventId: "evt-123",
      eventType: "file.translated",
      dedupeKey: "file:42:translated",
      redactedPayload: { fileId: 42 },
    });
    expect(first.inserted).toBe(true);
    expect(first.event?.processingStatus).toBe("pending");

    const duplicate = await insertProviderWebhookEventIdempotent({
      organizationId,
      subscriptionId: subscription.id,
      providerKind: "crowdin",
      providerEventId: "evt-123",
      eventType: "file.translated",
      dedupeKey: "file:42:translated",
      redactedPayload: { fileId: 99 },
    });
    expect(duplicate.inserted).toBe(false);
    expect(duplicate.event?.id).toBe(first.event?.id);

    const rows = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.redactedPayload).toEqual({ fileId: 42 });
  });

  it("dedupes when provider event id collides but dedupe key differs", async () => {
    const { organizationId, subscription } = await createSubscriptionFixture();

    const first = await insertProviderWebhookEventIdempotent({
      organizationId,
      subscriptionId: subscription.id,
      providerKind: "crowdin",
      providerEventId: "evt-123",
      eventType: "file.translated",
      dedupeKey: "file:42:translated:v1",
      redactedPayload: { fileId: 42 },
    });
    expect(first.inserted).toBe(true);

    const conflictingDedupeKey = await insertProviderWebhookEventIdempotent({
      organizationId,
      subscriptionId: subscription.id,
      providerKind: "crowdin",
      providerEventId: "evt-123",
      eventType: "file.translated",
      dedupeKey: "file:42:translated:v2",
      redactedPayload: { fileId: 99 },
    });
    expect(conflictingDedupeKey.inserted).toBe(false);
    expect(conflictingDedupeKey.event?.id).toBe(first.event?.id);

    const rows = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.providerEventId).toBe("evt-123");
    expect(rows[0]?.dedupeKey).toBe("file:42:translated:v1");
    expect(rows[0]?.redactedPayload).toEqual({ fileId: 42 });
  });

  it("treats redelivery with a new provider event id but the same dedupe key as a duplicate", async () => {
    const { organizationId, subscription } = await createSubscriptionFixture();

    const first = await insertProviderWebhookEventIdempotent({
      organizationId,
      subscriptionId: subscription.id,
      providerKind: "crowdin",
      providerEventId: "evt-original",
      eventType: "file.translated",
      dedupeKey: "file:42:translated",
      redactedPayload: { fileId: 42 },
    });
    expect(first.inserted).toBe(true);

    const redelivery = await insertProviderWebhookEventIdempotent({
      organizationId,
      subscriptionId: subscription.id,
      providerKind: "crowdin",
      providerEventId: "evt-redelivery",
      eventType: "file.translated",
      dedupeKey: "file:42:translated",
      redactedPayload: { fileId: 99 },
    });
    expect(redelivery.inserted).toBe(false);
    expect(redelivery.event?.id).toBe(first.event?.id);

    const rows = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.providerEventId).toBe("evt-original");
    expect(rows[0]?.redactedPayload).toEqual({ fileId: 42 });
  });

  it("transitions event processing status and links sync run references", async () => {
    const { organizationId, subscription } = await createSubscriptionFixture();

    const inserted = await insertProviderWebhookEventIdempotent({
      organizationId,
      subscriptionId: subscription.id,
      providerKind: "crowdin",
      providerEventId: "evt-456",
      eventType: "project.created",
      dedupeKey: "evt-456",
    });
    const eventId = inserted.event?.id;
    expect(eventId).toBeTruthy();

    const syncRun = await startProviderSyncRun({
      organizationId,
      providerKind: "crowdin",
      kind: "webhook",
      providerCredentialId: subscription.providerCredentialId,
    });

    const processing = await updateProviderWebhookEventProcessingStatus({
      eventId: eventId!,
      organizationId,
      processingStatus: "processing",
      providerSyncRunId: syncRun.id,
    });
    expect(processing.processingStatus).toBe("processing");
    expect(processing.providerSyncRunId).toBe(syncRun.id);
    expect(processing.attemptCount).toBe(1);

    const failed = await updateProviderWebhookEventProcessingStatus({
      eventId: eventId!,
      organizationId,
      processingStatus: "failed",
      errorMessage: "Worker unavailable",
      errorDetails: { retryable: true },
      nextRetryAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    expect(failed.processingStatus).toBe("failed");
    expect(failed.errorMessage).toBe("Worker unavailable");
    expect(failed.providerSyncRunId).toBe(syncRun.id);
    expect(failed.nextRetryAt?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
    expect(failed.attemptCount).toBe(1);

    const succeeded = await updateProviderWebhookEventProcessingStatus({
      eventId: eventId!,
      organizationId,
      processingStatus: "succeeded",
      providerSyncIntentId: randomUUID(),
    });
    expect(succeeded.processingStatus).toBe("succeeded");
    expect(succeeded.processedAt).toBeTruthy();
    expect(succeeded.providerSyncIntentId).toBeTruthy();
  });
});
