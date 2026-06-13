import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  dbUpdateMock,
  executeProviderSyncIntentMock,
  loggerErrorMock,
  logReconciliationSucceededMock,
  transactionMock,
  txUpdateMock,
} = vi.hoisted(() => ({
  dbUpdateMock: vi.fn(),
  executeProviderSyncIntentMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  logReconciliationSucceededMock: vi.fn(),
  transactionMock: vi.fn(),
  txUpdateMock: vi.fn(),
}));

vi.mock("@/lib/database", () => ({
  db: {
    transaction: transactionMock,
    update: dbUpdateMock,
  },
  schema: {
    providerSyncIntents: {
      id: "id",
      status: "status",
      nextAttemptAt: "next_attempt_at",
      leasedUntil: "leased_until",
      priority: "priority",
      createdAt: "created_at",
    },
  },
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    error: loggerErrorMock,
    info: vi.fn(),
  })),
}));

vi.mock("@/lib/providers/provider-tms-sync-telemetry", () => ({
  logReconciliationFailed: vi.fn(),
  logReconciliationSucceeded: logReconciliationSucceededMock,
}));

vi.mock("./provider-sync-executor", () => ({
  executeProviderSyncIntent: executeProviderSyncIntentMock,
}));

import { ok } from "@/lib/primitives/result/results";
import { runProviderSyncWorker } from "./provider-sync-worker";

function createIntent(id: string) {
  return {
    id,
    organizationId: "org_123",
    providerCredentialId: "credential_123",
    providerKind: "crowdin",
    syncKind: "project_scan",
    projectId: null,
    attempts: 1,
  };
}

function createUpdateChain(returningValue?: unknown) {
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => (returningValue ? [returningValue] : [])),
      })),
    })),
  };
}

describe("runProviderSyncWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a thrown intent failed and continues processing the leased batch", async () => {
    const firstIntent = createIntent("intent_1");
    const secondIntent = createIntent("intent_2");

    transactionMock.mockImplementationOnce(async (callback) =>
      callback({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({
                  for: vi.fn(async () => [firstIntent, secondIntent]),
                })),
              })),
            })),
          })),
        })),
        update: txUpdateMock,
      }),
    );
    txUpdateMock
      .mockReturnValueOnce(createUpdateChain(firstIntent))
      .mockReturnValueOnce(createUpdateChain(secondIntent));

    const persistedUpdates: unknown[] = [];
    dbUpdateMock.mockImplementation(() => ({
      set: vi.fn((value: unknown) => {
        persistedUpdates.push(value);
        return {
          where: vi.fn(async () => {}),
        };
      }),
    }));

    executeProviderSyncIntentMock
      .mockRejectedValueOnce(new Error("rate_limited"))
      .mockResolvedValueOnce(ok({ runId: "run_2" }));

    await expect(runProviderSyncWorker({ limit: 2 })).resolves.toEqual({
      processed: 2,
      succeeded: 1,
      failed: 1,
      skipped: 0,
    });

    expect(executeProviderSyncIntentMock).toHaveBeenCalledTimes(2);
    expect(persistedUpdates).toEqual([
      expect.objectContaining({
        status: "retryable",
        lastError: "rate_limited",
        leasedUntil: null,
        leasedBy: null,
        leaseToken: null,
      }),
      expect.objectContaining({
        status: "succeeded",
        providerSyncRunId: "run_2",
        leasedUntil: null,
        leasedBy: null,
        leaseToken: null,
      }),
    ]);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { intentId: "intent_1", syncKind: "project_scan", error: "rate_limited" },
      "unexpected error executing sync intent",
    );
    expect(logReconciliationSucceededMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSyncIntentId: "intent_2",
        providerSyncRunId: "run_2",
      }),
    );
  });
});
