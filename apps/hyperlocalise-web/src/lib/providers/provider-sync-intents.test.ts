import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database";

import { createProjectTestFixture } from "../../api/routes/project/project.fixture";
import { buildProviderSyncIntentLeaseKey } from "./provider-sync-intent-lease";
import {
  resolveProviderSyncDispatchRunner,
  type ProviderSyncIntentDispatcher,
} from "./provider-sync-intent-dispatch";
import { processProviderSyncIntent } from "./provider-sync-intent-worker";
import { startProviderSyncRun } from "./provider-sync-runs";
import { resolveSyncKindFromWebhookEvent } from "./provider-webhook-sync-mapping";
import {
  claimProviderSyncIntent,
  enqueueProviderSyncIntent,
  failProviderSyncIntent,
  PROVIDER_SYNC_INTENT_LEASE_MS,
  releaseExpiredProviderSyncIntentLeases,
} from "./provider-sync-intents";

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
      .set({ status: "running", attempts: 1 })
      .where(eq(schema.providerSyncIntents.id, intent.id));

    const failed = await failProviderSyncIntent({
      intentId: intent.id,
      organizationId: project.organizationId,
      errorMessage: "temporary provider outage",
      retryable: true,
    });

    expect(failed?.status).toBe("retryable");
    expect(failed?.eventReferences).toEqual(["event-1"]);
    expect(failed?.nextAttemptAt).toBeTruthy();
  });

  it("dispatches intents through the runner mapping", async () => {
    expect(resolveProviderSyncDispatchRunner("tm_scan")).toBe("tm_scan");
    expect(
      resolveSyncKindFromWebhookEvent({
        eventType: "project.created",
        resourceType: "project",
      }),
    ).toBe("project_scan");
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
});
