import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { dbSelectMock, loggerWarnMock, queueEnqueueMock, reclaimExpiredLeasesMock } = vi.hoisted(
  () => ({
    dbSelectMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    queueEnqueueMock: vi.fn(),
    reclaimExpiredLeasesMock: vi.fn(async () => 0),
  }),
);

vi.mock("@/lib/database", () => ({
  db: {
    select: dbSelectMock,
  },
  schema: {
    providerSyncIntents: {
      id: "id",
      organizationId: "organization_id",
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
    info: vi.fn(),
    warn: loggerWarnMock,
  })),
}));

vi.mock("@/lib/providers/provider-sync-intent", () => ({
  reclaimExpiredProviderSyncIntentLeases: reclaimExpiredLeasesMock,
}));

vi.mock("@/workflows/adapters", () => ({
  createProviderSyncQueue: vi.fn(() => ({
    enqueue: queueEnqueueMock,
  })),
}));

import { runProviderSyncWorkflowDispatcher } from "./provider-sync-workflow-dispatcher";

function mockDueIntents(intents: Array<{ id: string; organizationId: string }>) {
  dbSelectMock.mockReturnValueOnce({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => intents),
        })),
      })),
    })),
  });
}

describe("runProviderSyncWorkflowDispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reclaimExpiredLeasesMock.mockResolvedValue(0);
  });

  it("reclaims expired leases before dispatching due intents", async () => {
    mockDueIntents([]);
    const now = new Date("2026-06-14T12:00:00.000Z");

    await runProviderSyncWorkflowDispatcher({ limit: 1, now });

    expect(reclaimExpiredLeasesMock).toHaveBeenCalledWith(now);
  });

  it("starts a provider sync workflow for each due intent", async () => {
    mockDueIntents([
      { id: "intent_1", organizationId: "org_1" },
      { id: "intent_2", organizationId: "org_2" },
    ]);
    queueEnqueueMock
      .mockResolvedValueOnce({ ids: ["workflow_1"] })
      .mockResolvedValueOnce({ ids: ["workflow_2"] });

    await expect(runProviderSyncWorkflowDispatcher({ limit: 2 })).resolves.toEqual({
      processed: 2,
      started: 2,
      skipped: 0,
    });

    expect(queueEnqueueMock).toHaveBeenCalledWith({
      providerSyncIntentId: "intent_1",
      organizationId: "org_1",
    });
    expect(queueEnqueueMock).toHaveBeenCalledWith({
      providerSyncIntentId: "intent_2",
      organizationId: "org_2",
    });
  });

  it("continues dispatching when one workflow enqueue fails", async () => {
    mockDueIntents([
      { id: "intent_1", organizationId: "org_1" },
      { id: "intent_2", organizationId: "org_2" },
    ]);
    queueEnqueueMock
      .mockRejectedValueOnce(new Error("workflow unavailable"))
      .mockResolvedValueOnce({ ids: ["workflow_2"] });

    await expect(runProviderSyncWorkflowDispatcher({ limit: 2 })).resolves.toEqual({
      processed: 2,
      started: 1,
      skipped: 1,
    });

    expect(loggerWarnMock).toHaveBeenCalledWith(
      { intentId: "intent_1" },
      "failed to enqueue provider sync workflow",
    );
  });
});
