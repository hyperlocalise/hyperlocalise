import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import { buildProviderSyncIntentLeaseKey } from "./provider-sync-intent-lease";
import {
  resolveProviderSyncDispatchRunner,
  loadProviderSyncIntentApprovedTranslations,
  type ProviderSyncIntentDispatcher,
} from "./provider-sync-intent-dispatch";
import { processProviderSyncIntent } from "./provider-sync-intent-worker";
import { startProviderSyncRun } from "./provider-sync-runs";
import { completeAgentRun, createAgentRun, startAgentRun } from "./agent-runs";
import { upsertOrganizationExternalTmsProviderCredential } from "./organization-external-tms-provider-credentials";
import { upsertExternalJob } from "./organization-external-tms-jobs";
import {
  claimProviderSyncIntent,
  completeProviderSyncIntent,
  enqueueProviderSyncIntent,
  failProviderSyncIntent,
  PROVIDER_SYNC_INTENT_LEASE_MS,
  releaseExpiredProviderSyncIntentLeases,
} from "./provider-sync-intents";
import {
  insertProviderWebhookEvent,
  insertProviderWebhookSubscription,
} from "./provider-webhook-storage";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function createTestProject() {
  const { project } = await projectFixture.createStoredProjectFixture();
  return project;
}

describe("provider sync intents", () => {
  it("coalesces burst webhook events on the same lease key", async () => {
    const project = await createTestProject();
    const leaseKey = buildProviderSyncIntentLeaseKey({
      organizationId: project.organizationId,
      providerKind: "phrase",
      projectId: project.id,
      syncKind: "job_task_scan",
      resourceId: "job-1",
    });

    const first = await enqueueProviderSyncIntent({
      organizationId: project.organizationId,
      providerKind: "phrase",
      projectId: project.id,
      syncKind: "job_task_scan",
      resourceId: "job-1",
      cause: "webhook",
      eventReferences: ["event-a"],
    });
    const second = await enqueueProviderSyncIntent({
      organizationId: project.organizationId,
      providerKind: "phrase",
      projectId: project.id,
      syncKind: "job_task_scan",
      resourceId: "job-1",
      cause: "webhook",
      eventReferences: ["event-b"],
    });

    expect(first.coalesced).toBe(false);
    expect(second.coalesced).toBe(true);
    expect(second.intent.id).toBe(first.intent.id);
    expect(second.intent.leaseKey).toBe(leaseKey);
    expect(second.intent.eventReferences).toEqual(["event-a", "event-b"]);

    const intents = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, project.organizationId));
    expect(intents).toHaveLength(1);
  });

  it("atomically coalesces concurrent webhook events on the same lease key", async () => {
    const project = await createTestProject();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        enqueueProviderSyncIntent({
          organizationId: project.organizationId,
          providerKind: "phrase",
          projectId: project.id,
          syncKind: "job_task_scan",
          resourceId: "job-1",
          cause: "webhook",
          eventReferences: [`event-${index}`],
        }),
      ),
    );

    expect(new Set(results.map((result) => result.intent.id)).size).toBe(1);
    expect(results.filter((result) => !result.coalesced)).toHaveLength(1);

    const intents = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.organizationId, project.organizationId));
    expect(intents).toHaveLength(1);
    expect(new Set(intents[0]?.eventReferences)).toEqual(
      new Set(Array.from({ length: 8 }, (_, index) => `event-${index}`)),
    );
  });

  it("builds lease keys without delimiter collisions", async () => {
    const first = buildProviderSyncIntentLeaseKey({
      organizationId: "00000000-0000-0000-0000-000000000001",
      providerKind: "phrase",
      projectId: "project",
      syncKind: "job_task_scan",
      resourceId: "job_task_scan:resource",
    });
    const second = buildProviderSyncIntentLeaseKey({
      organizationId: "00000000-0000-0000-0000-000000000001",
      providerKind: "phrase",
      projectId: "project:job_task_scan",
      syncKind: "job_task_scan",
      resourceId: "resource",
    });

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });

  it("releases expired leases and allows reclaim", async () => {
    const project = await createTestProject();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expiredLease = new Date(now.getTime() - 1_000);

    const { intent } = await enqueueProviderSyncIntent({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      projectId: project.id,
      syncKind: "file_key_scan",
      cause: "scheduled",
    });

    await db
      .update(schema.providerSyncIntents)
      .set({
        status: "running",
        leasedUntil: expiredLease,
        leasedBy: "worker-a",
        attempts: 1,
      })
      .where(eq(schema.providerSyncIntents.id, intent.id));

    const releasedCount = await releaseExpiredProviderSyncIntentLeases({ now });
    expect(releasedCount).toBe(1);

    const reclaimed = await claimProviderSyncIntent({
      intentId: intent.id,
      organizationId: project.organizationId,
      workerId: "worker-b",
      now,
    });

    expect(reclaimed?.status).toBe("running");
    expect(reclaimed?.leasedBy).toBe("worker-b");
    expect(reclaimed?.leasedUntil?.getTime()).toBe(now.getTime() + PROVIDER_SYNC_INTENT_LEASE_MS);
  });

  it("marks worker failures as retryable without dropping webhook event references", async () => {
    const project = await createTestProject();

    const { intent } = await enqueueProviderSyncIntent({
      organizationId: project.organizationId,
      providerKind: "smartling",
      projectId: project.id,
      syncKind: "glossary_scan",
      cause: "webhook",
      eventReferences: ["event-1"],
    });

    await db
      .update(schema.providerSyncIntents)
      .set({ status: "running", attempts: 1, leasedBy: "worker-a" })
      .where(eq(schema.providerSyncIntents.id, intent.id));

    const failed = await failProviderSyncIntent({
      intentId: intent.id,
      organizationId: project.organizationId,
      workerId: "worker-a",
      errorMessage: "temporary provider outage",
      retryable: true,
    });

    expect(failed?.status).toBe("retryable");
    expect(failed?.eventReferences).toEqual(["event-1"]);
    expect(failed?.nextAttemptAt).toBeTruthy();
  });

  it("does not complete an intent after the worker loses its lease", async () => {
    const project = await createTestProject();

    const { intent } = await enqueueProviderSyncIntent({
      organizationId: project.organizationId,
      providerKind: "phrase",
      projectId: project.id,
      syncKind: "project_scan",
      cause: "manual",
    });

    await db
      .update(schema.providerSyncIntents)
      .set({ status: "running", attempts: 2, leasedBy: "worker-b" })
      .where(eq(schema.providerSyncIntents.id, intent.id));

    const completed = await completeProviderSyncIntent({
      intentId: intent.id,
      organizationId: project.organizationId,
      workerId: "worker-a",
      providerSyncRunId: null,
    });

    expect(completed).toBeNull();

    const [updated] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.id, intent.id));
    expect(updated?.status).toBe("running");
    expect(updated?.leasedBy).toBe("worker-b");
    expect(updated?.providerSyncRunId).toBeNull();
    expect(updated?.completedAt).toBeNull();
  });

  it("does not fail an intent after the worker loses its lease", async () => {
    const project = await createTestProject();

    const { intent } = await enqueueProviderSyncIntent({
      organizationId: project.organizationId,
      providerKind: "crowdin",
      projectId: project.id,
      syncKind: "tm_scan",
      cause: "manual",
    });

    await db
      .update(schema.providerSyncIntents)
      .set({ status: "running", attempts: 2, leasedBy: "worker-b" })
      .where(eq(schema.providerSyncIntents.id, intent.id));

    const failed = await failProviderSyncIntent({
      intentId: intent.id,
      organizationId: project.organizationId,
      workerId: "worker-a",
      errorMessage: "late worker failure",
      retryable: true,
    });

    expect(failed).toBeNull();

    const [updated] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.id, intent.id));
    expect(updated?.status).toBe("running");
    expect(updated?.leasedBy).toBe("worker-b");
    expect(updated?.lastError).toBeNull();
    expect(updated?.nextAttemptAt).toBeNull();
  });

  it("dispatches intents through the runner mapping", async () => {
    expect(resolveProviderSyncDispatchRunner("tm_scan")).toBe("tm_scan");
  });

  it("loads accepted translations for push translation intents from provider jobs", async () => {
    const project = await createTestProject();
    const externalJob = await upsertExternalJob({
      organizationId: project.organizationId,
      projectId: project.id,
      providerKind: "phrase",
      externalJobId: "phrase-job-1",
      externalStatus: "in_progress",
    });
    const run = await createAgentRun({
      organizationId: project.organizationId,
      providerKind: "phrase",
      externalJobId: "phrase-job-1",
      kind: "translate",
      hyperlocaliseJobId: externalJob.id,
    });

    await startAgentRun({ runId: run.id, organizationId: project.organizationId });
    await completeAgentRun({
      runId: run.id,
      organizationId: project.organizationId,
      changedItems: [
        {
          itemId: "string-1:fr",
          externalStringId: "string-1",
          key: "hello",
          locale: "fr",
          sourceText: "Hello",
          from: "",
          to: "Bonjour",
          reviewState: "accepted",
          changedFields: ["target"],
          warnings: {},
        },
        {
          itemId: "string-2:fr",
          externalStringId: "string-2",
          key: "bye",
          locale: "fr",
          sourceText: "Goodbye",
          from: "",
          to: "Au revoir",
          reviewState: "pending",
          changedFields: ["target"],
          warnings: {},
        },
      ],
    });

    await expect(
      loadProviderSyncIntentApprovedTranslations({
        organizationId: project.organizationId,
        projectId: project.id,
        providerKind: "phrase",
        externalJobId: "phrase-job-1",
      }),
    ).resolves.toEqual([
      {
        externalStringId: "string-1",
        key: "hello",
        locale: "fr",
        text: "Bonjour",
      },
    ]);
  });

  it("processes intents with an injected dispatcher", async () => {
    const project = await createTestProject();
    const syncRun = await startProviderSyncRun({
      organizationId: project.organizationId,
      providerKind: "lokalise",
      kind: "project_scan",
      projectId: project.id,
    });
    const dispatch = vi.fn<ProviderSyncIntentDispatcher["dispatch"]>(async () => ({
      runId: syncRun.id,
      status: "succeeded",
      runner: "project_scan",
    }));

    const { intent } = await enqueueProviderSyncIntent({
      organizationId: project.organizationId,
      providerKind: "lokalise",
      projectId: project.id,
      syncKind: "project_scan",
      cause: "manual",
    });

    const result = await processProviderSyncIntent({
      intentId: intent.id,
      organizationId: project.organizationId,
      workerId: "test-worker",
      dispatcher: { dispatch },
    });

    expect(result.ok).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);

    const [updated] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.id, intent.id));
    expect(updated?.status).toBe("succeeded");
    expect(updated?.providerSyncRunId).toBe(syncRun.id);
  });

  it("fails non-retryably when referenced webhook events were deleted", async () => {
    const project = await createTestProject();
    const staleEventId = randomUUID();
    const dispatch = vi.fn<ProviderSyncIntentDispatcher["dispatch"]>(async () => ({
      runId: randomUUID(),
      status: "succeeded",
      runner: "project_scan",
    }));

    const { intent } = await enqueueProviderSyncIntent({
      organizationId: project.organizationId,
      providerKind: "lokalise",
      projectId: project.id,
      syncKind: "project_scan",
      cause: "webhook",
      resourceId: staleEventId,
      eventReferences: [staleEventId],
    });

    const result = await processProviderSyncIntent({
      intentId: intent.id,
      organizationId: project.organizationId,
      workerId: "test-worker",
      dispatcher: { dispatch },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("provider_webhook_event_not_found");
    expect(dispatch).not.toHaveBeenCalled();

    const [updated] = await db
      .select()
      .from(schema.providerSyncIntents)
      .where(eq(schema.providerSyncIntents.id, intent.id));
    expect(updated?.status).toBe("failed");
    expect(updated?.leasedUntil).toBeNull();
    expect(updated?.leasedBy).toBeNull();
  });

  it("marks already-processing webhook events as failed when a coalesced event is missing", async () => {
    const { project, user } = await projectFixture.createStoredProjectFixture();
    const credential = await upsertOrganizationExternalTmsProviderCredential({
      organizationId: project.organizationId,
      userId: user.id,
      role: "owner",
      providerKind: "lokalise",
      displayName: "Lokalise",
      secretMaterial: "secret-token",
    });
    const subscription = await insertProviderWebhookSubscription({
      organizationId: project.organizationId,
      providerCredentialId: credential.id,
      providerKind: "lokalise",
      providerWebhookId: "provider-webhook-1",
      endpointUrl: "https://app.example.test/api/webhooks/tms/lokalise",
      subscribedEvents: ["project.updated"],
    });
    const survivingEvent = await insertProviderWebhookEvent({
      organizationId: project.organizationId,
      subscriptionId: subscription.id,
      providerKind: "lokalise",
      providerEventId: "event-A",
      eventType: "project.updated",
      dedupeKey: "event-A",
      projectId: project.id,
    });
    const missingEventId = randomUUID();
    const dispatch = vi.fn<ProviderSyncIntentDispatcher["dispatch"]>(async () => ({
      runId: randomUUID(),
      status: "succeeded",
      runner: "project_scan",
    }));

    expect(survivingEvent).not.toBeNull();
    if (!survivingEvent) {
      return;
    }

    const { intent } = await enqueueProviderSyncIntent({
      organizationId: project.organizationId,
      providerKind: "lokalise",
      projectId: project.id,
      syncKind: "project_scan",
      cause: "webhook",
      eventReferences: [survivingEvent.id, missingEventId],
    });

    const result = await processProviderSyncIntent({
      intentId: intent.id,
      organizationId: project.organizationId,
      workerId: "test-worker",
      dispatcher: { dispatch },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("provider_webhook_event_not_found");
    expect(dispatch).not.toHaveBeenCalled();

    const [updatedEvent] = await db
      .select()
      .from(schema.providerWebhookEvents)
      .where(eq(schema.providerWebhookEvents.id, survivingEvent.id));
    expect(updatedEvent?.processingStatus).toBe("failed");
    expect(updatedEvent?.errorMessage).toBe("provider_webhook_event_not_found");
    expect(updatedEvent?.providerSyncIntentId).toBe(intent.id);
  });
});
