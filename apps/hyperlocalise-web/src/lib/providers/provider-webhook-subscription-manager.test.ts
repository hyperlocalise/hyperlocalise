import "dotenv/config";

import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";
import {
  disableProviderWebhookSubscription,
  ensureProviderWebhookSubscription,
  ensureProviderWebhookSubscriptionsForCredential,
  retryProviderWebhookSubscriptionSetup,
} from "./provider-webhook-subscription-manager";

describe("provider webhook subscription manager", () => {
  const createdRecordsByTest = new Map<
    string,
    { organizationIds: Set<string>; userIds: Set<string> }
  >();

  function currentTestKey() {
    return expect.getState().currentTestName ?? "__provider_webhook_subscription_manager__";
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

  async function createCrowdinCredential() {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
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
      externalProjectId: "12345",
      targetLocales: ["fr"],
      isActive: true,
    });

    return { organizationId, credential, projectId };
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
        .delete(schema.projects)
        .where(inArray(schema.projects.organizationId, organizationIds));
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

  it("creates a manual-required subscription until provider adapters are implemented", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    const result = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });

    expect(result.status).toBe("manual_required");
    expect(result.subscription.providerWebhookId).toMatch(/^pending-/);
    expect(result.subscription.manualFallback?.webhookUrl).toContain("/api/webhooks/tms/crowdin");
    expect(result.subscription.manualFallback?.subscribedEvents).toEqual([]);
    expect(result.subscription.canRetry).toBe(true);
  });

  it("reuses an existing manual subscription for the same credential and project", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    const first = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });

    const second = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });

    expect(second.status).toBe("manual_required");
    expect(second.subscription.id).toBe(first.subscription.id);
    expect(second.subscription.providerWebhookId).toBe(first.subscription.providerWebhookId);
  });

  it("ensures credential-level subscriptions only for projects attached to that credential", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();
    const orphanedProjectId = `project_${randomUUID()}`;

    await db.insert(schema.projects).values({
      id: orphanedProjectId,
      organizationId,
      name: "Orphaned Crowdin project",
      description: "",
      translationContext: "",
      source: "external_tms",
      externalProviderCredentialId: null,
      externalProviderKind: "crowdin",
      externalProjectId: "orphaned-12345",
      targetLocales: ["de"],
      isActive: true,
    });

    const results = await ensureProviderWebhookSubscriptionsForCredential({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.subscription.projectId).toBe(projectId);

    const subscriptions = await db
      .select({
        projectId: schema.providerWebhookSubscriptions.projectId,
        providerCredentialId: schema.providerWebhookSubscriptions.providerCredentialId,
      })
      .from(schema.providerWebhookSubscriptions)
      .where(inArray(schema.providerWebhookSubscriptions.organizationId, [organizationId]));

    expect(subscriptions).toEqual([
      {
        projectId,
        providerCredentialId: credential.id,
      },
    ]);
  });

  it("disables subscriptions locally", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    const created = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });

    const disabled = await disableProviderWebhookSubscription({
      organizationId,
      subscriptionId: created.subscription.id,
    });

    expect(disabled.status).toBe("disabled");
  });

  it("retries by refreshing the manual fallback subscription", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    const first = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });
    expect(first.status).toBe("manual_required");

    const retried = await retryProviderWebhookSubscriptionSetup({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
    });

    expect(retried.status).toBe("manual_required");
    expect(retried.subscription.id).toBe(first.subscription.id);
  });

  it("uses the same provider-agnostic fallback for other TMS providers", async () => {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "secret-token",
    });

    const result = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "phrase",
      providerCredentialId: credential.id,
      projectId: null,
    });

    expect(result.status).toBe("manual_required");
    expect(result.subscription.manualFallback?.webhookUrl).toContain("/api/webhooks/tms/phrase");
  });
});
