import { describe, expect, it, vi, beforeEach } from "vite-plus/test";

const { processProviderSyncIntentMock, sleepMock } = vi.hoisted(() => ({
  processProviderSyncIntentMock: vi.fn(),
  sleepMock: vi.fn(async () => {}),
}));

vi.mock("workflow", () => ({
  getWorkflowMetadata: vi.fn(() => ({ workflowRunId: "workflow-run-1" })),
  sleep: sleepMock,
}));

vi.mock("@/lib/providers/sync/provider-sync-intent-worker", () => ({
  processProviderSyncIntent: processProviderSyncIntentMock,
}));

import { providerWebhookReconciliationWorkflow } from "./provider-webhook-reconciliation";

const event = {
  providerWebhookEventId: "event-1",
  providerSyncIntentId: "intent-1",
  organizationId: "org-1",
  subscriptionId: "subscription-1",
  providerKind: "phrase",
} as const;

describe("providerWebhookReconciliationWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-dispatches retryable intents after their next attempt time", async () => {
    const nextAttemptAt = new Date("2026-01-01T00:01:00.000Z");

    processProviderSyncIntentMock
      .mockResolvedValueOnce({
        ok: false,
        intentId: "intent-1",
        status: "retryable",
        reason: "provider_sync_run_failed",
        nextAttemptAt,
      })
      .mockResolvedValueOnce({
        ok: true,
        intentId: "intent-1",
        providerSyncRunId: "run-1",
        status: "succeeded",
      });

    const result = await providerWebhookReconciliationWorkflow(event);

    expect(sleepMock).toHaveBeenCalledWith(nextAttemptAt);
    expect(processProviderSyncIntentMock).toHaveBeenCalledTimes(2);
    expect(processProviderSyncIntentMock).toHaveBeenNthCalledWith(1, {
      intentId: "intent-1",
      organizationId: "org-1",
      workerId: "workflow-run-1",
    });
    expect(processProviderSyncIntentMock).toHaveBeenNthCalledWith(2, {
      intentId: "intent-1",
      organizationId: "org-1",
      workerId: "workflow-run-1",
    });
    expect(result.processResult).toEqual({
      ok: true,
      intentId: "intent-1",
      providerSyncRunId: "run-1",
      status: "succeeded",
    });
  });
});
