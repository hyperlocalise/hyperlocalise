import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  updateSets: [] as unknown[],
  getWorkspaceResourceUsageMock: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/database", () => ({
  db: {
    transaction: mocks.transactionMock,
  },
  schema: {
    workspaceResourceUsageSyncStates: {
      id: "id",
      organizationId: "organizationId",
      featureId: "featureId",
    },
  },
}));

vi.mock("@/lib/billing/workspace-resource-limits", () => ({
  getWorkspaceResourceUsage: mocks.getWorkspaceResourceUsageMock,
  workspaceResourceFeatureIds: {
    seats: "seats",
    projects: "projects",
    automations: "automations",
    integrations: "integrations",
  },
}));

import { syncWorkspaceResourceUsageToAutumn } from "@/lib/billing/workspace-resource-usage-sync";

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createSyncState(input: { id: string; featureId: string; syncedUsage: number }) {
  return {
    id: input.id,
    organizationId: "org_123",
    featureId: input.featureId,
    syncedUsage: input.syncedUsage,
    syncSequence: 0,
  };
}

function createTransaction(input: { syncedUsageByFeatureId: Record<string, number> }) {
  return async (callback: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn(() => ({
        values: vi.fn((values: { featureId: string }) => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => {
              const featureId = values.featureId;
              return [
                createSyncState({
                  id: `state_${featureId}`,
                  featureId,
                  syncedUsage: input.syncedUsageByFeatureId[featureId] ?? 0,
                }),
              ];
            }),
          })),
        })),
      })),
      select: vi.fn(),
      update: vi.fn(() => ({
        set: vi.fn((values) => {
          mocks.updateSets.push(values);
          return {
            where: vi.fn().mockResolvedValue(undefined),
          };
        }),
      })),
    };

    return callback(tx);
  };
}

afterEach(() => {
  mocks.transactionMock.mockReset();
  mocks.getWorkspaceResourceUsageMock.mockReset();
  mocks.updateSets.length = 0;
});

describe("workspace resource usage sync", () => {
  it("stores up_to_date when local usage already matches synced usage", async () => {
    mocks.getWorkspaceResourceUsageMock.mockResolvedValue({
      seats: 1,
      projects: 1,
      automations: 0,
      integrations: 2,
    });
    mocks.transactionMock.mockImplementation(
      createTransaction({
        syncedUsageByFeatureId: {
          seats: 1,
          projects: 1,
          automations: 0,
          integrations: 2,
        },
      }),
    );

    const result = await syncWorkspaceResourceUsageToAutumn({
      organizationId: "org_123",
      autumnApiKey: "am_test",
      fetchFn: vi.fn() as unknown as typeof fetch,
    });

    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ featureId: "seats", status: "up_to_date" }),
        expect.objectContaining({ featureId: "projects", status: "up_to_date" }),
        expect.objectContaining({ featureId: "automations", status: "up_to_date" }),
        expect.objectContaining({ featureId: "integrations", status: "up_to_date" }),
      ]),
    );
    expect(mocks.updateSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "up_to_date", lastSyncError: null }),
      ]),
    );
  });

  it("syncs fixed workspace resource features concurrently", async () => {
    const fetchGate = createDeferred();
    let startedFetches = 0;
    const fetchFn = vi.fn(async () => {
      startedFetches += 1;
      await fetchGate.promise;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    mocks.getWorkspaceResourceUsageMock.mockResolvedValue({
      seats: 1,
      projects: 1,
      automations: 1,
      integrations: 1,
    });
    mocks.transactionMock.mockImplementation(
      createTransaction({
        syncedUsageByFeatureId: {
          seats: 0,
          projects: 0,
          automations: 0,
          integrations: 0,
        },
      }),
    );

    const syncPromise = syncWorkspaceResourceUsageToAutumn({
      organizationId: "org_123",
      autumnApiKey: "am_test",
      fetchFn,
    });

    try {
      await vi.waitUntil(() => startedFetches === 4, { timeout: 500 });
      expect(startedFetches).toBe(4);
    } finally {
      fetchGate.resolve();
    }

    await expect(syncPromise).resolves.toMatchObject({
      status: "synced",
      results: expect.arrayContaining([
        expect.objectContaining({ featureId: "seats", status: "synced" }),
        expect.objectContaining({ featureId: "projects", status: "synced" }),
        expect.objectContaining({ featureId: "automations", status: "synced" }),
        expect.objectContaining({ featureId: "integrations", status: "synced" }),
      ]),
    });
  });
});
