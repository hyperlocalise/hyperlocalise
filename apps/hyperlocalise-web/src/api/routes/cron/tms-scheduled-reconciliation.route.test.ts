import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const scheduleIncrementalProviderSyncIntentsMock = vi.fn(async () => ({
  enqueued: 1,
  skipped: 0,
}));

const runProviderSyncWorkflowDispatcherMock = vi.fn(async () => ({
  processed: 1,
  started: 1,
  skipped: 0,
}));

async function createClient(input?: { cronSecret?: string | null }) {
  const cronSecret = input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret");

  vi.resetModules();
  vi.doMock("@/lib/providers/provider-sync-worker", () => ({
    scheduleIncrementalProviderSyncIntents: scheduleIncrementalProviderSyncIntentsMock,
  }));
  vi.doMock("@/lib/providers/provider-sync-workflow-dispatcher", () => ({
    runProviderSyncWorkflowDispatcher: runProviderSyncWorkflowDispatcherMock,
  }));
  vi.doMock("@/lib/env", () => ({
    env: {
      CRON_SECRET: cronSecret,
      TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK: 100,
    },
  }));

  const { createTmsScheduledReconciliationRoutes } =
    await import("./tms-scheduled-reconciliation.route");

  return testClient(createTmsScheduledReconciliationRoutes());
}

describe("tms scheduled reconciliation cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/providers/provider-sync-worker");
    vi.doUnmock("@/lib/providers/provider-sync-workflow-dispatcher");
    vi.doUnmock("@/lib/env");
    scheduleIncrementalProviderSyncIntentsMock.mockClear();
    runProviderSyncWorkflowDispatcherMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();

    const response = await client.index.$get();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("schedules provider sync intents and starts workflow runs when authorized", async () => {
    const client = await createClient();

    const response = await client.index.$get(
      {},
      {
        headers: {
          authorization: "Bearer cron-secret",
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: {
        scheduler: {
          enqueued: 1,
          skipped: 0,
        },
        dispatcher: {
          processed: 1,
          started: 1,
          skipped: 0,
        },
      },
    });
    expect(scheduleIncrementalProviderSyncIntentsMock).toHaveBeenCalledTimes(1);
    expect(runProviderSyncWorkflowDispatcherMock).toHaveBeenCalledTimes(1);
    expect(runProviderSyncWorkflowDispatcherMock).toHaveBeenCalledWith({
      limit: 100,
    });
  });
});
