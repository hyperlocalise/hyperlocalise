import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const runScheduledReconciliationMock = vi.fn(async () => [
  {
    schedule: "incremental",
    intentsEnqueued: 1,
    intentsCoalesced: 0,
    intentsSkipped: 0,
    credentialsSkipped: 0,
    projectsSkipped: 0,
    auditsCompleted: 0,
    healthChecksCompleted: 0,
  },
]);

async function createClient(input?: { enabled?: boolean; cronSecret?: string | null }) {
  vi.resetModules();
  vi.doMock("@/workflows/adapters", () => ({
    createProviderWebhookReconciliationQueue: () => ({
      enqueue: vi.fn(async () => ({ ids: ["workflow-1"] })),
    }),
  }));
  vi.doMock("@/lib/providers/provider-scheduled-reconciliation", () => ({
    runScheduledReconciliation: runScheduledReconciliationMock,
  }));
  vi.doMock("@/lib/env", () => ({
    env: {
      TMS_SCHEDULED_RECONCILIATION_ENABLED: input?.enabled ?? true,
      TMS_SCHEDULED_RECONCILIATION_CRON_SECRET:
        input?.cronSecret === null ? undefined : (input?.cronSecret ?? "cron-secret"),
      TMS_SCHEDULED_RECONCILIATION_INCREMENTAL_INTERVAL_MINUTES: 15,
      TMS_SCHEDULED_RECONCILIATION_TM_GLOSSARY_INTERVAL_MINUTES: 60,
      TMS_SCHEDULED_RECONCILIATION_FULL_INTERVAL_MINUTES: 24 * 60,
      TMS_SCHEDULED_RECONCILIATION_AUDIT_INTERVAL_MINUTES: 24 * 60,
      TMS_SCHEDULED_RECONCILIATION_FULL_HOUR_UTC: 3,
      TMS_SCHEDULED_RECONCILIATION_AUDIT_HOUR_UTC: 4,
      TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK: 500,
    },
  }));

  const { createTmsScheduledReconciliationRoutes } =
    await import("./tms-scheduled-reconciliation.route");

  return testClient(createTmsScheduledReconciliationRoutes());
}

describe("tms scheduled reconciliation cron route", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/workflows/adapters");
    vi.doUnmock("@/lib/providers/provider-scheduled-reconciliation");
    vi.doUnmock("@/lib/env");
    runScheduledReconciliationMock.mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    const client = await createClient();

    const response = await client.index.$post();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("runs scheduled reconciliation when authorized", async () => {
    const client = await createClient();

    const response = await client.index.$post(
      {},
      {
        headers: {
          authorization: "Bearer cron-secret",
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          schedule: "incremental",
          intentsEnqueued: 1,
          intentsCoalesced: 0,
          intentsSkipped: 0,
          credentialsSkipped: 0,
          projectsSkipped: 0,
          auditsCompleted: 0,
          healthChecksCompleted: 0,
        },
      ],
    });
    expect(runScheduledReconciliationMock).toHaveBeenCalledTimes(1);
  });

  it("returns disabled when scheduled reconciliation is turned off", async () => {
    const client = await createClient({ enabled: false });

    const response = await client.index.$post(
      {},
      {
        headers: {
          authorization: "Bearer cron-secret",
        },
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "scheduled_reconciliation_disabled",
    });
  });
});
