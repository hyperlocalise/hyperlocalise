import "dotenv/config";

import { createHmac, randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createApp } from "@/api/app";
import { db, schema } from "@/lib/database";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/organization-external-tms-provider-credentials";
import { insertProviderWebhookSubscription } from "@/lib/providers/provider-webhook-storage";
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
    role: "owner",
  });

  return { organizationId, userId };
}

async function createSubscriptionFixture(input: { webhookSecretPlaintext?: string | null } = {}) {
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
    providerWebhookId: "webhook-1",
    endpointUrl: "https://app.example.test/api/webhooks/tms/crowdin",
    webhookSecretPlaintext:
      input.webhookSecretPlaintext === undefined
        ? "webhook-signing-secret"
        : input.webhookSecretPlaintext,
  });

  return { organizationId, subscription };
}

function signatureFor(body: string, secret = "webhook-signing-secret") {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function postWebhook(input: {
  app: ReturnType<typeof createApp>;
  body: string;
  signature?: string;
  webhookId?: string;
}) {
  return input.app.request("http://localhost/api/webhooks/tms/crowdin", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hyperlocalise-provider-webhook-id": input.webhookId ?? "webhook-1",
      "x-hyperlocalise-signature-256": input.signature ?? signatureFor(input.body),
    },
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
    const syncIntentId = randomUUID();
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue(event) {
          queuedEvents.push(event);
          return { ids: [syncIntentId] };
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
    expect(queuedEvents).toEqual([
      {
        providerWebhookEventId: expect.any(String),
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
      providerSyncIntentId: syncIntentId,
    });
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
    const syncIntentId = randomUUID();
    let enqueueAttempts = 0;
    const app = createApp({
      providerWebhookReconciliationQueue: {
        async enqueue(event) {
          enqueueAttempts += 1;
          if (enqueueAttempts === 1) {
            throw new Error("queue unavailable");
          }

          queuedEvents.push(event);
          return { ids: [syncIntentId] };
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
    expect(queuedEvents).toEqual([
      {
        providerWebhookEventId: expect.any(String),
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
      providerSyncIntentId: syncIntentId,
      processingStatus: "pending",
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
});
