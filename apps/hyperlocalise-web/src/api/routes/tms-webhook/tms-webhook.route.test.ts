import "dotenv/config";

import { createHmac, randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/organization-external-tms-provider-credentials";
import { insertProviderWebhookSubscription } from "@/lib/providers/webhooks/provider-webhook-storage";
import type { ProviderWebhookReconciliationEventData } from "@/lib/workflow/types";

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

async function createSubscriptionFixture(input: { webhookSecretPlaintext?: string | null } = {}) {
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
    providerWebhookId: "webhook-1",
    endpointUrl: "https://app.example.test/api/webhooks/tms/crowdin",
    webhookSecretPlaintext:
      input.webhookSecretPlaintext === undefined
        ? "webhook-signing-secret"
        : input.webhookSecretPlaintext,
  });

  return { organizationId, subscription };
}

async function createPhraseSubscriptionFixture() {
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
    providerWebhookId: "phrase-wh-1",
    endpointUrl: "https://app.example.test/api/webhooks/tms/phrase?provider_webhook_id=phrase-wh-1",
    webhookSecretPlaintext: "webhook-signing-secret",
  });

  return { organizationId, subscription };
}

function signatureFor(body: string, secret = "webhook-signing-secret") {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function phraseSignatureFor(body: string, secret = "webhook-signing-secret") {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function postWebhook(input: {
  app: ReturnType<typeof createApp>;
  body: string;
  signature?: string | null;
  webhookSecretHeader?: string;
  webhookId?: string;
  deliveryId?: string;
}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-hyperlocalise-provider-webhook-id": input.webhookId ?? "webhook-1",
  };

  if (input.signature !== null) {
    headers["x-hyperlocalise-signature-256"] = input.signature ?? signatureFor(input.body);
  }
  if (input.webhookSecretHeader) {
    headers["x-hyperlocalise-webhook-secret"] = input.webhookSecretHeader;
  }
  if (input.deliveryId) {
    headers["x-hyperlocalise-delivery-id"] = input.deliveryId;
  }

  return input.app.request("http://localhost/api/webhooks/tms/crowdin", {
    method: "POST",
    headers,
    body: input.body,
  });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  const organizationIds = [...createdOrganizationIds];
  const userIds = [...createdUserIds];

  if (organizationIds.length > 0) {
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

describe("tmsWebhookRoutes", () => {
  it("stores accepted events and queues reconciliation", async () => {
    const { organizationId, subscription } = await createSubscriptionFixture();
    const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue(event) {
          queuedEvents.push(event);
          return { ids: [randomUUID()] };
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-1",
      event_type: "file.updated",
      resource_type: "file",
      resource_id: "file-1",
    });

    const response = await postWebhook({ app, body });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: false });
    const [intent] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, organizationId));

    expect(intent).toMatchObject({
      organizationId,
      providerKind: "crowdin",
      syncKind: "file_key_scan",
      cause: "webhook",
      status: "pending",
    });
    expect(intent?.eventReferences.length).toBeGreaterThan(0);

    expect(queuedEvents).toEqual([
      {
        providerWebhookEventId: expect.any(String),
        providerSyncIntentId: intent?.id,
        organizationId,
        subscriptionId: subscription.id,
        providerKind: "crowdin",
      },
    ]);

    const [event] = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(event).toMatchObject({
      organizationId,
      providerKind: "crowdin",
      providerEventId: "evt-1",
      eventType: "file.updated",
      dedupeKey: "evt-1",
      resourceType: "file",
      resourceId: "file-1",
      providerSyncIntentId: intent?.id,
    });
  });

  it("persists provider sync intent ids for reconciliation", async () => {
    const { subscription } = await createSubscriptionFixture();
    const workflowRunId = "run_workflow_persisted789";
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue() {
          return { ids: [workflowRunId] };
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-workflow-run",
      event_type: "file.updated",
    });

    const response = await postWebhook({ app, body });
    expect(response.status).toBe(202);

    const [intent] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, subscription.organizationId));
    const [event] = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(event?.providerSyncIntentId).toBe(intent?.id);
    expect(event?.providerSyncIntentId).not.toBe(workflowRunId);
  });

  it("skips unrecognized webhook event types without queueing reconciliation", async () => {
    const { organizationId, subscription } = await createSubscriptionFixture();
    const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue(event) {
          queuedEvents.push(event);
          return { ids: [randomUUID()] };
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-unknown-event-type",
      event_type: "system.ping",
      resource_type: "webhook",
    });

    const response = await postWebhook({ app, body });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
    expect(queuedEvents).toHaveLength(0);

    const intents = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, organizationId));
    expect(intents).toHaveLength(0);

    const [event] = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(event).toMatchObject({
      processingStatus: "skipped",
      errorMessage: "unrecognized_provider_webhook_event",
      providerSyncIntentId: null,
    });
  });

  it("stores write-back confirmations as unsupported without queueing write-back", async () => {
    const { organizationId, subscription } = await createSubscriptionFixture();
    const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue(event) {
          queuedEvents.push(event);
          return { ids: [randomUUID()] };
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-writeback-confirmed",
      event_type: "write_back.completed",
      resource_type: "task",
      resource_id: "task-1",
    });

    const response = await postWebhook({ app, body });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
    expect(queuedEvents).toHaveLength(0);

    const intents = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, organizationId));
    expect(intents).toHaveLength(0);

    const [event] = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(event).toMatchObject({
      processingStatus: "skipped",
      errorMessage: "unsupported_provider_webhook_event",
      providerSyncIntentId: null,
      errorDetails: {
        eventType: "write_back.completed",
        resourceType: "task",
        mappedIntentKinds: ["post_write_back_confirmation"],
      },
    });
  });

  it("dedupes provider retries that use a new delivery id for the same event", async () => {
    const { subscription } = await createSubscriptionFixture();
    const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue(event) {
          queuedEvents.push(event);
          return { ids: [randomUUID()] };
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-retry-delivery",
      event_type: "file.updated",
    });

    const first = await postWebhook({ app, body, deliveryId: "delivery-1" });
    const retry = await postWebhook({ app, body, deliveryId: "delivery-2" });

    expect(first.status).toBe(202);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toEqual({
      ok: true,
      ignored: true,
      duplicate: true,
    });
    expect(queuedEvents).toHaveLength(1);

    const rows = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dedupeKey).toBe("evt-retry-delivery");
  });

  it("dedupes repeated deliveries without queueing duplicate work", async () => {
    const { subscription } = await createSubscriptionFixture();
    const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue(event) {
          queuedEvents.push(event);
          return { ids: [randomUUID()] };
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-duplicate",
      event_type: "project.updated",
      dedupe_key: "project-1:update",
    });

    const first = await postWebhook({ app, body });
    const duplicate = await postWebhook({ app, body });

    expect(first.status).toBe(202);
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toEqual({
      ok: true,
      ignored: true,
      duplicate: true,
    });
    expect(queuedEvents).toHaveLength(1);

    const rows = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(rows).toHaveLength(1);
  });

  it("requeues a pending duplicate when the first enqueue failed", async () => {
    const { subscription } = await createSubscriptionFixture();
    const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
    let enqueueAttempts = 0;
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue(event) {
          enqueueAttempts += 1;
          if (enqueueAttempts === 1) {
            throw new Error("queue unavailable");
          }

          queuedEvents.push(event);
          return { ids: [randomUUID()] };
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-retry",
      event_type: "file.updated",
    });

    const first = await postWebhook({ app, body });
    const retry = await postWebhook({ app, body });

    expect(first.status).toBe(500);
    expect(retry.status).toBe(202);
    await expect(retry.json()).resolves.toEqual({
      ok: true,
      ignored: false,
      duplicate: true,
    });
    const [intent] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, subscription.organizationId));

    expect(queuedEvents).toEqual([
      {
        providerWebhookEventId: expect.any(String),
        providerSyncIntentId: intent?.id,
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        providerKind: "crowdin",
      },
    ]);

    const [event] = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(event).toMatchObject({
      providerEventId: "evt-retry",
      providerSyncIntentId: intent?.id,
      processingStatus: "pending",
    });
  });

  it("re-derives duplicate requeue mapping from the stored event fields", async () => {
    const { subscription } = await createSubscriptionFixture();
    const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
    let enqueueAttempts = 0;
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue(event) {
          enqueueAttempts += 1;
          if (enqueueAttempts === 1) {
            throw new Error("queue unavailable");
          }

          queuedEvents.push(event);
          return { ids: [randomUUID()] };
        },
      },
    });
    const firstBody = JSON.stringify({
      event_id: "evt-stored-file-update",
      event_type: "file.updated",
      resource_type: "file",
      resource_id: "file-1",
      dedupe_key: "shared-dedupe-key",
    });
    const duplicateBody = JSON.stringify({
      event_id: "evt-live-writeback-confirmation",
      event_type: "write_back.completed",
      resource_type: "task",
      resource_id: "task-1",
      dedupe_key: "shared-dedupe-key",
    });

    const first = await postWebhook({ app, body: firstBody });
    const duplicate = await postWebhook({ app, body: duplicateBody });

    expect(first.status).toBe(500);
    expect(duplicate.status).toBe(202);
    await expect(duplicate.json()).resolves.toEqual({
      ok: true,
      ignored: false,
      duplicate: true,
    });
    expect(queuedEvents).toHaveLength(1);

    const [intent] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, subscription.organizationId));
    expect(intent).toMatchObject({
      syncKind: "file_key_scan",
      resourceId: "file-1",
    });

    const [event] = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(event).toMatchObject({
      providerEventId: "evt-stored-file-update",
      eventType: "file.updated",
      resourceType: "file",
      resourceId: "file-1",
      providerSyncIntentId: intent?.id,
    });
  });

  it("intentionally ignores unknown subscriptions", async () => {
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue() {
          throw new Error("unexpected enqueue");
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-unknown",
      event_type: "file.updated",
    });

    const response = await postWebhook({
      app,
      body,
      webhookId: "missing-webhook",
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true, ignored: true });
  });

  it("rejects invalid signatures without storing events", async () => {
    const { subscription } = await createSubscriptionFixture();
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue() {
          throw new Error("unexpected enqueue");
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-invalid",
      event_type: "file.updated",
    });

    const response = await postWebhook({
      app,
      body,
      signature: signatureFor(body, "wrong-secret"),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });

    const rows = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(rows).toHaveLength(0);
  });

  it("accepts Crowdin webhook secret headers", async () => {
    const { subscription } = await createSubscriptionFixture();
    let enqueueCount = 0;
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue() {
          enqueueCount += 1;
          return { ids: [randomUUID()] };
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-plaintext-secret",
      event_type: "file.updated",
    });

    const response = await postWebhook({
      app,
      body,
      signature: null,
      webhookSecretHeader: "webhook-signing-secret",
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      ignored: false,
    });
    expect(enqueueCount).toBe(1);

    const rows = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(rows).toHaveLength(1);
  });

  it("rejects active subscriptions when the webhook secret is unavailable", async () => {
    const { subscription } = await createSubscriptionFixture({ webhookSecretPlaintext: null });
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue() {
          throw new Error("unexpected enqueue");
        },
      },
    });
    const body = JSON.stringify({
      event_id: "evt-no-secret",
      event_type: "file.updated",
    });

    const response = await postWebhook({ app, body, signature: signatureFor(body) });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "webhook_secret_unavailable" });

    const rows = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
    expect(rows).toHaveLength(0);
  });

  describe("Lokalise webhooks", () => {
    async function createLokaliseSubscriptionFixture() {
      const { organizationId, userId } = await createOrganizationUser();
      const credential = await upsertOrganizationExternalTmsProviderCredential({
        organizationId,
        userId,
        role: "admin",
        providerKind: "lokalise",
        displayName: "Lokalise",
        secretMaterial: "secret-token",
      });
      const subscription = await insertProviderWebhookSubscription({
        organizationId,
        providerCredentialId: credential.id,
        providerKind: "lokalise",
        providerWebhookId: "lokalise-wh-1",
        endpointUrl: "https://app.example.test/api/webhooks/tms/lokalise",
        webhookSecretPlaintext: "webhook-signing-secret",
      });

      return { organizationId, subscription };
    }

    function postLokaliseWebhook(input: {
      app: ReturnType<typeof createApp>;
      body: string;
      secret?: string | null;
      webhookId?: string;
    }) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "webhook-id": input.webhookId ?? "lokalise-wh-1",
      };

      if (input.secret !== null) {
        headers["x-secret"] = input.secret ?? "webhook-signing-secret";
      }

      return input.app.request("http://localhost/api/webhooks/tms/lokalise", {
        method: "POST",
        headers,
        body: input.body,
      });
    }

    it("accepts signed translation events and queues reconciliation", async () => {
      const { organizationId, subscription } = await createLokaliseSubscriptionFixture();
      const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
      const app = createApp({
        providerWebhookReconciliationQueue: {
          async enqueue(event) {
            queuedEvents.push(event);
            return { ids: [randomUUID()] };
          },
        },
      });
      const body = JSON.stringify({
        uuid: "evt-lokalise-translation",
        event: "project.translation.updated",
        key: { id: 789 },
        project: { id: "lokalise-project-1" },
      });

      const response = await postLokaliseWebhook({ app, body });

      expect(response.status).toBe(202);
      const [intent] = await db
        .select()
        .from(schema.providerSyncIntents)
        .where(eq(schema.providerSyncIntents.organizationId, organizationId));
      expect(intent).toMatchObject({
        organizationId,
        providerKind: "lokalise",
        syncKind: "file_key_scan",
        cause: "webhook",
        status: "pending",
      });
      expect(queuedEvents).toHaveLength(1);
      expect(queuedEvents[0]?.subscriptionId).toBe(subscription.id);
    });

    it("rejects Lokalise deliveries with invalid secrets", async () => {
      await createLokaliseSubscriptionFixture();
      const app = createApp();
      const body = JSON.stringify({
        uuid: "evt-lokalise-invalid",
        event: "project.translation.updated",
        key: { id: 1 },
      });

      const response = await postLokaliseWebhook({ app, body, secret: "wrong-secret" });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    });
  });

  describe("Smartling webhooks", () => {
    async function createSmartlingSubscriptionFixture() {
      const { organizationId, userId } = await createOrganizationUser();
      const credential = await upsertOrganizationExternalTmsProviderCredential({
        organizationId,
        userId,
        role: "admin",
        providerKind: "smartling",
        displayName: "Smartling",
        secretMaterial: "secret-token",
      });
      const subscription = await insertProviderWebhookSubscription({
        organizationId,
        providerCredentialId: credential.id,
        providerKind: "smartling",
        providerWebhookId: "smartling-wh-1",
        endpointUrl: "https://app.example.test/api/webhooks/tms/smartling",
        webhookSecretPlaintext: "webhook-signing-secret",
      });

      return { organizationId, subscription };
    }

    function smartlingSignatureFor(body: string, eventId: string, eventTimestamp: string) {
      const signedPayload = `${eventId}.${eventTimestamp}.${body}`;
      return createHmac("sha256", "webhook-signing-secret").update(signedPayload).digest("hex");
    }

    function postSmartlingWebhook(input: {
      app: ReturnType<typeof createApp>;
      body: string;
      eventId?: string;
      eventTimestamp?: string;
      signature?: string | null;
    }) {
      const eventId = input.eventId ?? "evt-smartling-1";
      const eventTimestamp = input.eventTimestamp ?? String(Math.floor(Date.now() / 1000));
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "event-id": eventId,
        "event-timestamp": eventTimestamp,
        "x-hyperlocalise-provider-webhook-id": "smartling-wh-1",
      };

      if (input.signature !== null) {
        headers["event-signature"] =
          input.signature ?? smartlingSignatureFor(input.body, eventId, eventTimestamp);
      }

      return input.app.request("http://localhost/api/webhooks/tms/smartling", {
        method: "POST",
        headers,
        body: input.body,
      });
    }

    it("accepts signed file events and queues reconciliation", async () => {
      const { organizationId, subscription } = await createSmartlingSubscriptionFixture();
      const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
      const app = createApp({
        providerWebhookReconciliationQueue: {
          async enqueue(event) {
            queuedEvents.push(event);
            return { ids: [randomUUID()] };
          },
        },
      });
      const body = JSON.stringify({
        type: "file.published",
        file: { fileUri: "/locales/en.json" },
        project: { projectUid: "smartling-project-1" },
      });

      const response = await postSmartlingWebhook({ app, body, eventId: "evt-smartling-file" });

      expect(response.status).toBe(202);
      const [intent] = await db
        .select()
        .from(schema.providerSyncIntents)
        .where(eq(schema.providerSyncIntents.organizationId, organizationId));
      expect(intent).toMatchObject({
        organizationId,
        providerKind: "smartling",
        syncKind: "file_key_scan",
        cause: "webhook",
        status: "pending",
      });
      expect(queuedEvents).toHaveLength(1);
      expect(queuedEvents[0]?.subscriptionId).toBe(subscription.id);
    });

    it("rejects Smartling deliveries with invalid signatures", async () => {
      await createSmartlingSubscriptionFixture();
      const app = createApp();
      const body = JSON.stringify({
        type: "file.published",
        file: { fileUri: "/locales/en.json" },
      });

      const response = await postSmartlingWebhook({
        app,
        body,
        signature: "invalid-signature",
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    });
  });

  describe("Phrase webhooks", () => {
    function postPhraseWebhook(input: {
      app: ReturnType<typeof createApp>;
      body: string;
      signature?: string | null;
    }) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-phraseapp-event": "uploads:create",
      };

      if (input.signature !== null) {
        headers["x-phraseapp-signature"] = input.signature ?? phraseSignatureFor(input.body);
      }

      return input.app.request(
        "http://localhost/api/webhooks/tms/phrase?provider_webhook_id=phrase-wh-1",
        {
          method: "POST",
          headers,
          body: input.body,
        },
      );
    }

    it("accepts signed upload events and queues coarse reconciliation", async () => {
      const { organizationId, subscription } = await createPhraseSubscriptionFixture();
      const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
      const app = createApp({
        providerWebhookReconciliationQueue: {
          async enqueue(event) {
            queuedEvents.push(event);
            return { ids: [randomUUID()] };
          },
        },
      });
      const body = JSON.stringify({
        event_uid: "evt-phrase-upload",
        event: "uploads:create",
        upload: { id: "upload-1" },
      });

      const response = await postPhraseWebhook({ app, body });

      expect(response.status).toBe(202);
      const intents = await db
        .select()
        .from(schema.providerSyncIntents)
        .where(eq(schema.providerSyncIntents.organizationId, organizationId));
      expect(intents.map((intent) => intent.syncKind).sort()).toEqual([
        "file_key_scan",
        "pull_content",
      ]);
      expect(queuedEvents).toHaveLength(2);
      expect(queuedEvents.every((event) => event.subscriptionId === subscription.id)).toBe(true);
    });

    it("requeues only missing Phrase upload intents after partial enqueue failure", async () => {
      const { organizationId, subscription } = await createPhraseSubscriptionFixture();
      const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
      let enqueueAttempts = 0;
      const app = createApp({
        providerWebhookReconciliationQueue: {
          async enqueue(event) {
            enqueueAttempts += 1;
            if (enqueueAttempts === 2) {
              throw new Error("queue unavailable");
            }

            queuedEvents.push(event);
            return { ids: [randomUUID()] };
          },
        },
      });
      const body = JSON.stringify({
        event_uid: "evt-phrase-upload-partial",
        event: "uploads:create",
        upload: { id: "upload-1" },
      });

      const first = await postPhraseWebhook({ app, body });
      const retry = await postPhraseWebhook({ app, body });

      expect(first.status).toBe(500);
      expect(retry.status).toBe(202);
      await expect(retry.json()).resolves.toEqual({
        ok: true,
        ignored: false,
        duplicate: true,
      });

      const queuedIntentIds = queuedEvents.map((event) => event.providerSyncIntentId);
      const intents = await db
        .select()
        .from(schema.providerSyncIntents)
        .where(inArray(schema.providerSyncIntents.id, queuedIntentIds));
      expect(intents.map((intent) => intent.syncKind).sort()).toEqual([
        "file_key_scan",
        "pull_content",
      ]);
      expect(queuedEvents).toHaveLength(2);
      expect(queuedEvents.every((event) => event.subscriptionId === subscription.id)).toBe(true);

      const [event] = await db
        .select()
        .from(schema.providerWebhookEvents)
        .where(eq(schema.providerWebhookEvents.organizationId, organizationId));
      expect(event).toMatchObject({
        providerEventId: "evt-phrase-upload-partial",
        providerSyncIntentId: expect.any(String),
        processingStatus: "pending",
      });
    });

    it("rejects Phrase deliveries with invalid signatures", async () => {
      await createPhraseSubscriptionFixture();
      const app = createApp();
      const body = JSON.stringify({
        event_uid: "evt-phrase-invalid",
        event: "keys:create",
      });

      const response = await postPhraseWebhook({ app, body, signature: "invalid-signature" });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "invalid_signature" });
    });

    it("dedupes repeated Phrase deliveries without queueing duplicate work", async () => {
      const { subscription } = await createPhraseSubscriptionFixture();
      const queuedEvents: ProviderWebhookReconciliationEventData[] = [];
      const app = createApp({
        providerWebhookReconciliationQueue: {
          async enqueue(event) {
            queuedEvents.push(event);
            return { ids: [randomUUID()] };
          },
        },
      });
      const body = JSON.stringify({
        event_uid: "evt-phrase-duplicate",
        event: "uploads:create",
        upload: { id: "upload-1" },
      });

      const first = await postPhraseWebhook({ app, body });
      const duplicate = await postPhraseWebhook({ app, body });

      expect(first.status).toBe(202);
      expect(duplicate.status).toBe(200);
      await expect(duplicate.json()).resolves.toEqual({
        ok: true,
        ignored: true,
        duplicate: true,
      });
      expect(queuedEvents).toHaveLength(2);

      const rows = await db
        .select()
        .from(schema.providerWebhookEvents)
        .where(eq(schema.providerWebhookEvents.subscriptionId, subscription.id));
      expect(rows).toHaveLength(1);
    });
  });
});
