import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { returningMock, setMock, updateMock } = vi.hoisted(() => {
  const returningMock = vi.fn(async () => []);
  const whereMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  return { returningMock, setMock, updateMock };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ["and", conditions]),
  eq: vi.fn((field: string, value: unknown) => ["eq", field, value]),
  inArray: vi.fn((field: string, values: unknown[]) => ["inArray", field, values]),
  lte: vi.fn((field: string, value: unknown) => ["lte", field, value]),
}));

vi.mock("@/lib/database", () => ({
  db: {
    update: updateMock,
  },
  schema: {
    providerSyncIntents: {
      id: "id",
      status: "status",
      leasedUntil: "leasedUntil",
    },
  },
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock("@/lib/providers/provider-tms-sync-telemetry", () => ({
  logIntentEnqueued: vi.fn(),
}));

import { reclaimExpiredProviderSyncIntentLeases } from "./provider-sync-intent";

describe("reclaimExpiredProviderSyncIntentLeases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    returningMock.mockResolvedValue([]);
  });

  it("marks expired running intents as retryable", async () => {
    const now = new Date("2026-06-14T12:00:00.000Z");
    returningMock.mockResolvedValueOnce([{ id: "intent_1" }, { id: "intent_2" }] as never);

    await expect(reclaimExpiredProviderSyncIntentLeases(now)).resolves.toBe(2);

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "retryable",
        leasedUntil: null,
        leasedBy: null,
        leaseToken: null,
        nextAttemptAt: now,
        lastError: "lease_expired",
      }),
    );
  });
});
