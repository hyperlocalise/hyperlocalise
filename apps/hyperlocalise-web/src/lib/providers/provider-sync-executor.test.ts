import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { dbInsertMock, dbSelectMock, dbUpdateMock, listTmsProviderLiveProjectsMock } = vi.hoisted(
  () => ({
    dbInsertMock: vi.fn(),
    dbSelectMock: vi.fn(),
    dbUpdateMock: vi.fn(),
    listTmsProviderLiveProjectsMock: vi.fn(),
  }),
);

vi.mock("@/lib/database", () => ({
  db: {
    insert: dbInsertMock,
    select: dbSelectMock,
    update: dbUpdateMock,
  },
  schema: {
    organizationExternalTmsProviderCredentials: {
      id: "credential_id",
      createdByUserId: "created_by_user_id",
      updatedByUserId: "updated_by_user_id",
    },
    providerSyncRuns: {
      id: "id",
    },
  },
}));

vi.mock("@/lib/providers/tms-provider-live", () => ({
  getTmsProviderLiveProject: vi.fn(),
  listTmsProviderLiveProjects: listTmsProviderLiveProjectsMock,
}));

vi.mock("@/lib/projects/upsert-external-tms-project-record", () => ({
  upsertExternalTmsProjectRecord: vi.fn(),
}));

import { isOk } from "@/lib/primitives/result/results";
import { executeProviderSyncIntent } from "./provider-sync-executor";

type ProviderSyncIntentInput = Parameters<typeof executeProviderSyncIntent>[0];

function createCatalogIntent(): ProviderSyncIntentInput {
  return {
    id: "intent_123",
    organizationId: "org_123",
    providerCredentialId: "credential_123",
    providerKind: "crowdin",
    projectId: null,
    syncKind: "project_scan",
    resourceId: null,
    resourceIds: [],
    cause: "manual",
    eventReferences: [],
    priority: 20,
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    leaseKey: "org_123:crowdin:project_scan::",
    leasedUntil: null,
    leasedBy: null,
    leaseToken: null,
    nextAttemptAt: null,
    providerSyncRunId: null,
    lastError: null,
    errorDetails: {},
    createdAt: new Date("2026-06-14T00:00:00.000Z"),
    updatedAt: new Date("2026-06-14T00:00:00.000Z"),
    completedAt: null,
  };
}

describe("executeProviderSyncIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    dbInsertMock.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: "run_123" }]),
      })),
    });
    dbUpdateMock.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(async () => {}),
      })),
    });
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              createdByUserId: "user_created",
              updatedByUserId: "user_updated",
            },
          ]),
        })),
      })),
    });
    listTmsProviderLiveProjectsMock.mockResolvedValue([]);
  });

  it("uses the credential user when executing a catalog project scan", async () => {
    const result = await executeProviderSyncIntent(createCatalogIntent());

    expect(isOk(result)).toBe(true);
    expect(listTmsProviderLiveProjectsMock).toHaveBeenCalledWith("org_123", {
      actorUserId: "user_updated",
    });
  });
});
