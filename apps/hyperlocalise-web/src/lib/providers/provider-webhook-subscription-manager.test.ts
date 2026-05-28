import "dotenv/config";

import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

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

  function createCrowdinWebhookFetch(input: { status?: number; patchFails?: boolean } = {}) {
    return vi.fn(async (_url, init) => {
      if (input.status) {
        return new Response(JSON.stringify({ error: "provider failure" }), {
          status: input.status,
        });
      }

      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};

      if (method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: 77,
              projectId: 12345,
              name: body.name,
              url: body.url,
              events: body.events,
              headers: body.headers ?? {},
              payload: {},
              isActive: true,
              requestType: "POST",
              contentType: "application/json",
              batchingEnabled: false,
              createdAt: "2026-05-28T00:00:00Z",
              updatedAt: "2026-05-28T00:00:00Z",
            },
          }),
          { status: 200 },
        );
      }

      if (method === "PATCH") {
        if (input.patchFails) {
          return new Response(JSON.stringify({ error: "provider failure" }), {
            status: 500,
          });
        }

        const operations = Array.isArray(body) ? body : [];
        const headers = operations.find((operation) => operation.path === "/headers")?.value as
          | Record<string, string>
          | undefined;
        return new Response(
          JSON.stringify({
            data: {
              id: 77,
              projectId: 12345,
              name: "Hyperlocalise sync",
              url: "https://app.example.test/api/webhooks/tms/crowdin",
              events: [
                "file.added",
                "file.updated",
                "file.reverted",
                "file.deleted",
                "file.translated",
                "file.approved",
                "project.translated",
                "project.approved",
                "project.built",
                "translation.updated",
                "string.added",
                "string.updated",
                "string.deleted",
                "stringComment.created",
                "stringComment.updated",
                "stringComment.deleted",
                "stringComment.restored",
                "suggestion.added",
                "suggestion.updated",
                "suggestion.deleted",
                "suggestion.approved",
                "suggestion.disapproved",
                "task.added",
                "task.statusChanged",
                "task.deleted",
              ],
              headers: headers ?? {},
              payload: {},
              isActive: true,
              requestType: "POST",
              contentType: "application/json",
              batchingEnabled: false,
              createdAt: "2026-05-28T00:00:00Z",
              updatedAt: "2026-05-28T00:00:00Z",
            },
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;
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

  it("resumes Crowdin webhook setup after header activation fails", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();
    const failingFetch = createCrowdinWebhookFetch({ patchFails: true });

    const failed = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
      fetchFn: failingFetch,
    });

    expect(failed.status).toBe("provider_error");
    expect(failed.subscription.providerWebhookId).toBe("77");

    const resumeFetch = createCrowdinWebhookFetch();
    const resumed = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
      fetchFn: resumeFetch,
    });

    expect(resumed.status).toBe("active");
    expect(resumed.subscription.providerWebhookId).toBe("77");
    expect(resumed.subscription.id).toBe(failed.subscription.id);
    expect(failingFetch).toHaveBeenCalledTimes(2);
    expect(resumeFetch).toHaveBeenCalledTimes(1);
    expect(resumeFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("creates an automatic Crowdin webhook subscription", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();
    const fetchMock = createCrowdinWebhookFetch();

    const result = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
      fetchFn: fetchMock,
    });

    expect(result.status).toBe("active");
    expect(result.subscription.providerWebhookId).toBe("77");
    expect(result.subscription.manualFallback).toBeNull();
    expect(result.subscription.endpointUrl).toBe(
      "https://app.example.test/api/webhooks/tms/crowdin",
    );
    expect(result.subscription.subscribedEvents).toContain("file.updated");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses an existing active subscription for the same credential and project", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();
    const fetchMock = createCrowdinWebhookFetch();

    const first = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
      fetchFn: fetchMock,
    });

    const second = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
    });

    expect(second.status).toBe("active");
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
      fetchFn: createCrowdinWebhookFetch(),
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
      fetchFn: createCrowdinWebhookFetch(),
    });

    const disabled = await disableProviderWebhookSubscription({
      organizationId,
      subscriptionId: created.subscription.id,
      fetchFn: createCrowdinWebhookFetch(),
    });

    expect(disabled.status).toBe("disabled");
  });

  it("marks Crowdin permission failures without blocking manual sync", async () => {
    const { organizationId, credential, projectId } = await createCrowdinCredential();

    const first = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "12345",
      fetchFn: createCrowdinWebhookFetch({ status: 403 }),
    });
    expect(first.status).toBe("permission_error");
    expect(first.subscription.manualFallback?.webhookUrl).toContain("/api/webhooks/tms/crowdin");

    const retried = await retryProviderWebhookSubscriptionSetup({
      organizationId,
      providerKind: "crowdin",
      providerCredentialId: credential.id,
      projectId,
      fetchFn: createCrowdinWebhookFetch(),
    });

    expect(retried.status).toBe("active");
    expect(retried.subscription.id).toBe(first.subscription.id);
  });

  async function createSmartlingCredential() {
    const { organizationId, userId } = await createOrganizationUser();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId,
      userId,
      role: "owner",
      providerKind: "smartling",
      displayName: "Smartling",
      secretMaterial: "user-1:secret-1:acct-smartling-1",
    });

    const projectId = `project_${randomUUID()}`;
    await db.insert(schema.projects).values({
      id: projectId,
      organizationId,
      name: "Smartling project",
      description: "",
      translationContext: "",
      source: "external_tms",
      externalProviderCredentialId: credential.id,
      externalProviderKind: "smartling",
      externalProjectId: "smartling-project-1",
      targetLocales: ["fr-FR"],
      isActive: true,
    });

    return { organizationId, credential, projectId };
  }

  function createSmartlingWebhookFetch(input: { updateFails?: boolean; status?: number } = {}) {
    return vi.fn(async (url, init) => {
      const target = String(url);

      if (input.status) {
        return new Response(
          JSON.stringify({
            response: {
              code: "VALIDATION_ERROR",
              errors: [{ message: "maximum subscriptions reached" }],
            },
          }),
          { status: input.status },
        );
      }

      if (target.endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (target.includes("/subscriptions") && (init?.method ?? "GET") === "GET") {
        return new Response(
          JSON.stringify({
            response: { code: "SUCCESS", data: { items: [], totalCount: 0 } },
          }),
          { status: 200 },
        );
      }

      if (
        target.includes("/subscriptions") &&
        init?.method === "POST" &&
        !target.endsWith("/disable")
      ) {
        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                subscriptionUid: "sub-smartling-1",
                subscriptionName: body.subscriptionName,
                subscriptionUrl: body.subscriptionUrl,
                payloadSecret: body.payloadSecret,
                requestHeaders: body.requestHeaders ?? [],
                events: body.events ?? [],
                projectUids: body.projectUids ?? [],
                isActive: true,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (target.includes("/subscriptions/sub-smartling-1") && init?.method === "PUT") {
        if (input.updateFails) {
          return new Response(JSON.stringify({ response: { code: "ERROR" } }), { status: 500 });
        }

        const body =
          typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                subscriptionUid: "sub-smartling-1",
                subscriptionName: body.subscriptionName,
                subscriptionUrl: body.subscriptionUrl,
                payloadSecret: body.payloadSecret,
                requestHeaders: body.requestHeaders ?? [],
                events: body.events ?? [],
                projectUids: body.projectUids ?? [],
                isActive: true,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;
  }

  it("creates an active Smartling webhook subscription when automatic setup is available", async () => {
    const { organizationId, credential, projectId } = await createSmartlingCredential();

    const result = await ensureProviderWebhookSubscription({
      organizationId,
      providerKind: "smartling",
      providerCredentialId: credential.id,
      projectId,
      externalProjectId: "smartling-project-1",
      fetchFn: createSmartlingWebhookFetch(),
    });

    expect(result.status).toBe("active");
    expect(result.subscription.providerWebhookId).toBe("sub-smartling-1");
    expect(result.subscription.subscribedEvents).toContain("file.published");
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
