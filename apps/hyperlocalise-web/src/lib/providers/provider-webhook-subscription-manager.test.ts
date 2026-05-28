import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";
import { listDefaultWebhookEvents } from "./provider-webhook-default-events";
import {
  auditProviderWebhookSubscriptions,
  disableProviderWebhookSubscription,
  ensureProviderWebhookSubscription,
  retryProviderWebhookSubscriptionSetup,
} from "./provider-webhook-subscription-manager";
import { ProviderWebhookSubscriptionAdapterError } from "./provider-webhook-subscription-types";

function activeCrowdinRemoteSubscription(providerWebhookId: string) {
  return {
    providerWebhookId,
    endpointUrl: "https://app.example.test/api/webhooks/tms/crowdin",
    subscribedEvents: listDefaultWebhookEvents("crowdin"),
    isActive: true,
  };
}

const mockAdapter = {
  supportsAutomaticSetup: true,
  listRemoteSubscriptions: vi.fn(),
  createRemoteSubscription: vi.fn(),
  updateRemoteSubscription: vi.fn(),
  disableRemoteSubscription: vi.fn(),
  deleteRemoteSubscription: vi.fn(),
};

vi.mock("./provider-webhook-subscription-adapters", () => ({
  getProviderWebhookSubscriptionAdapter: () => mockAdapter,
}));

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
    vi.clearAllMocks();
    mockAdapter.supportsAutomaticSetup = true;

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

  it("creates an active subscription when provider setup succeeds", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    mockAdapter.createRemoteSubscription.mockResolvedValue(activeCrowdinRemoteSubscription("99"));

    const result = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });

    expect(result.status).toBe("active");
    expect(result.subscription.providerWebhookId).toBe("99");
    expect(result.subscription.manualFallback).toBeNull();
    expect(mockAdapter.createRemoteSubscription).toHaveBeenCalledOnce();
  });

  it("skips remote updates for unchanged active subscriptions", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    mockAdapter.createRemoteSubscription.mockResolvedValue(activeCrowdinRemoteSubscription("99"));

    await ensureProviderWebhookSubscription({
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

    expect(second.status).toBe("active");
    expect(mockAdapter.createRemoteSubscription).toHaveBeenCalledOnce();
    expect(mockAdapter.updateRemoteSubscription).not.toHaveBeenCalled();
  });

  it("stores permission_error with manual fallback when provider rejects access", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    mockAdapter.createRemoteSubscription.mockRejectedValue(
      new ProviderWebhookSubscriptionAdapterError("permission_denied", "Insufficient scope", {
        httpStatus: 403,
      }),
    );

    const result = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });

    expect(result.status).toBe("permission_error");
    expect(result.subscription.manualFallback?.webhookUrl).toContain("/api/webhooks/tms/crowdin");
    expect(result.subscription.manualFallback?.lastError).toBe("Insufficient scope");
    expect(result.subscription.canRetry).toBe(true);
  });

  it("stores provider_error when remote setup fails", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    mockAdapter.createRemoteSubscription.mockRejectedValue(
      new ProviderWebhookSubscriptionAdapterError("provider_error", "Crowdin API unavailable", {
        httpStatus: 502,
      }),
    );

    const result = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });

    expect(result.status).toBe("provider_error");
    expect(result.subscription.lastError).toBe("Crowdin API unavailable");
  });

  it("disables active subscriptions locally and at the provider", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    mockAdapter.createRemoteSubscription.mockResolvedValue(activeCrowdinRemoteSubscription("77"));

    const created = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });

    mockAdapter.disableRemoteSubscription.mockResolvedValue(undefined);

    const disabled = await disableProviderWebhookSubscription({
      organizationId,
      subscriptionId: created.subscription.id,
    });

    expect(disabled.status).toBe("disabled");
    expect(mockAdapter.disableRemoteSubscription).toHaveBeenCalledOnce();
  });

  it("retries setup after a previous failure", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    mockAdapter.createRemoteSubscription.mockRejectedValueOnce(
      new ProviderWebhookSubscriptionAdapterError("provider_error", "Temporary outage"),
    );
    mockAdapter.createRemoteSubscription.mockResolvedValueOnce(
      activeCrowdinRemoteSubscription("88"),
    );

    const failed = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });
    expect(failed.status).toBe("provider_error");

    const retried = await retryProviderWebhookSubscriptionSetup({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
    });

    expect(retried.status).toBe("active");
    expect(retried.subscription.providerWebhookId).toBe("88");
  });

  it("marks subscriptions stale when remote webhook disappears during audit", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    mockAdapter.createRemoteSubscription.mockResolvedValue(activeCrowdinRemoteSubscription("55"));
    mockAdapter.listRemoteSubscriptions.mockResolvedValue([]);

    const created = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });
    expect(created.status).toBe("active");

    const results = await auditProviderWebhookSubscriptions({ organizationId });
    const audited = results.find((item) => item.subscriptionId === created.subscription.id);

    expect(audited?.action).toBe("marked_stale");
    expect(audited?.status).toBe("provider_error");

    const [row] = await db
      .select({ status: schema.providerWebhookSubscriptions.status })
      .from(schema.providerWebhookSubscriptions)
      .where(eq(schema.providerWebhookSubscriptions.id, created.subscription.id))
      .limit(1);

    expect(row?.status).toBe("provider_error");
  });

  it("requires manual setup for providers without automatic adapters", async () => {
    mockAdapter.supportsAutomaticSetup = false;

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
    expect(mockAdapter.createRemoteSubscription).not.toHaveBeenCalled();
  });
});
