import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  createProviderAgentTranslationQueueMock,
  dbInsertMock,
  dbSelectMock,
  dbUpdateMock,
  enqueueProviderProjectJobSyncIntentMock,
  fetchCrowdinJobTasksMock,
  listTmsProviderLiveProjectsMock,
  resolveSecretMaterialForActorMock,
  runTmsAgentAutomationForSyncedJobMock,
  upsertExternalTmsJobRecordsMock,
  deactivateMissingExternalTmsProjectsMock,
  deactivateExternalTmsProjectMock,
} = vi.hoisted(() => ({
  createProviderAgentTranslationQueueMock: vi.fn(() => ({ enqueue: vi.fn() })),
  dbInsertMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  enqueueProviderProjectJobSyncIntentMock: vi.fn(),
  fetchCrowdinJobTasksMock: vi.fn(),
  listTmsProviderLiveProjectsMock: vi.fn(),
  resolveSecretMaterialForActorMock: vi.fn(),
  runTmsAgentAutomationForSyncedJobMock: vi.fn(
    async (): Promise<{ triggered: string[] }> => ({ triggered: [] }),
  ),
  upsertExternalTmsJobRecordsMock: vi.fn(),
  deactivateMissingExternalTmsProjectsMock: vi.fn(async () => 0),
  deactivateExternalTmsProjectMock: vi.fn(async () => false),
}));

vi.mock("@/lib/database", () => ({
  db: {
    insert: dbInsertMock,
    select: dbSelectMock,
    update: dbUpdateMock,
  },
  schema: {
    organizationExternalTmsProviderCredentials: {
      id: "credential_id",
      organizationId: "credential_organization_id",
      providerKind: "credential_provider_kind",
      createdByUserId: "created_by_user_id",
      updatedByUserId: "updated_by_user_id",
    },
    projects: {
      id: "project_id",
      organizationId: "project_organization_id",
      externalProviderKind: "project_external_provider_kind",
      externalProjectId: "project_external_project_id",
      source: "project_source",
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

vi.mock("@/lib/projects/external-tms/external-tms-sync-service", () => ({
  upsertExternalTmsProjectRecord: vi.fn(async () => "ext:crowdin:902807"),
  deactivateMissingExternalTmsProjects: deactivateMissingExternalTmsProjectsMock,
  deactivateExternalTmsProject: deactivateExternalTmsProjectMock,
  upsertExternalTmsJobRecords: upsertExternalTmsJobRecordsMock,
}));

vi.mock("./provider-sync-intent", () => ({
  enqueueProviderProjectJobSyncIntent: enqueueProviderProjectJobSyncIntentMock,
}));

vi.mock("@/lib/providers/adapters/tms-provider-adapter-registry", () => ({
  tmsProviderJobTaskFetchers: {
    crowdin: fetchCrowdinJobTasksMock,
  },
}));

vi.mock("@/lib/providers/tms-provider-content", () => ({
  resolveExternalTmsSecretMaterialForActor: resolveSecretMaterialForActorMock,
}));

vi.mock("./agent-runs/tms-agent-automation-runner", () => ({
  runTmsAgentAutomationForSyncedJob: runTmsAgentAutomationForSyncedJobMock,
}));

vi.mock("@/workflows/adapters", () => ({
  createProviderAgentCommentQueue: vi.fn(() => ({ enqueue: vi.fn() })),
  createProviderAgentQaQueue: vi.fn(() => ({ enqueue: vi.fn() })),
  createProviderAgentTranslationQueue: createProviderAgentTranslationQueueMock,
  createProviderAgentWritebackQueue: vi.fn(() => ({ enqueue: vi.fn() })),
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

function createJobTaskIntent(): ProviderSyncIntentInput {
  return {
    ...createCatalogIntent(),
    projectId: "ext:crowdin:902807",
    syncKind: "job_task_scan",
    leaseKey: "org_123:crowdin:job_task_scan:ext:crowdin:902807:",
    priority: 10,
  };
}

function mockCredentialActor(input: {
  createdByUserId: string | null;
  updatedByUserId: string | null;
}) {
  dbSelectMock.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => [input]),
      })),
    })),
  });
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
    mockCredentialActor({
      createdByUserId: "user_created",
      updatedByUserId: "user_updated",
    });
    listTmsProviderLiveProjectsMock.mockResolvedValue([]);
    enqueueProviderProjectJobSyncIntentMock.mockResolvedValue({
      intentId: "intent_job",
      created: true,
    });
    resolveSecretMaterialForActorMock.mockResolvedValue("secret");
    fetchCrowdinJobTasksMock.mockResolvedValue([]);
    upsertExternalTmsJobRecordsMock.mockResolvedValue({
      upserted: 0,
      newlySyncedJobIds: [],
      removed: 0,
    });
    runTmsAgentAutomationForSyncedJobMock.mockResolvedValue({ triggered: [] });
  });

  it("uses the credential user when executing a catalog project scan", async () => {
    listTmsProviderLiveProjectsMock.mockResolvedValue([
      {
        externalProviderKind: "crowdin",
        externalProjectId: "902807",
        name: "Demo",
        sourceLocale: "en",
        targetLocales: ["fr"],
        isActive: true,
      },
    ]);

    const result = await executeProviderSyncIntent(createCatalogIntent());

    expect(isOk(result)).toBe(true);
    expect(listTmsProviderLiveProjectsMock).toHaveBeenCalledWith("org_123", {
      actorUserId: "user_updated",
    });
    expect(enqueueProviderProjectJobSyncIntentMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      providerCredentialId: "credential_123",
      providerKind: "crowdin",
      projectId: "ext:crowdin:902807",
      cause: "manual",
    });
    expect(deactivateMissingExternalTmsProjectsMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      providerCredentialId: "credential_123",
      providerKind: "crowdin",
      syncedProjectIds: ["ext:crowdin:902807"],
    });
  });

  it("falls back to the credential creator when the updater is missing", async () => {
    mockCredentialActor({
      createdByUserId: "user_created",
      updatedByUserId: null,
    });

    const result = await executeProviderSyncIntent(createCatalogIntent());

    expect(isOk(result)).toBe(true);
    expect(listTmsProviderLiveProjectsMock).toHaveBeenCalledWith("org_123", {
      actorUserId: "user_created",
    });
  });

  it("fetches and upserts provider job tasks for a project job scan", async () => {
    const project = {
      id: "ext:crowdin:902807",
      organizationId: "org_123",
      externalProviderKind: "crowdin",
      externalProjectId: "902807",
      source: "external_tms",
    };
    const credential = {
      id: "credential_123",
      organizationId: "org_123",
      providerKind: "crowdin",
      authMode: "api_token",
    };
    const tasks = [
      {
        externalJobId: "task-1",
        externalStatus: "in_progress",
        title: "Homepage",
        targetLocales: ["fr"],
      },
    ];

    dbSelectMock
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [project]),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [credential]),
          })),
        })),
      })
      .mockReturnValueOnce({
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
    fetchCrowdinJobTasksMock.mockResolvedValue(tasks);
    const hyperlocaliseJobId = "ext:crowdin:902807:task-1";
    upsertExternalTmsJobRecordsMock.mockResolvedValue({
      upserted: 1,
      newlySyncedJobIds: [hyperlocaliseJobId],
      removed: 0,
    });

    const result = await executeProviderSyncIntent(createJobTaskIntent());

    expect(isOk(result)).toBe(true);
    expect(resolveSecretMaterialForActorMock).toHaveBeenCalledWith({
      credential,
      organizationId: "org_123",
      actorUserId: "user_updated",
    });
    expect(fetchCrowdinJobTasksMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      projectId: "ext:crowdin:902807",
      providerKind: "crowdin",
      externalProjectId: "902807",
      credential,
      project,
      secretMaterial: "secret",
    });
    expect(upsertExternalTmsJobRecordsMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      projectId: "ext:crowdin:902807",
      providerKind: "crowdin",
      externalProjectId: "902807",
      tasks,
    });
    expect(runTmsAgentAutomationForSyncedJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_123",
        projectId: "ext:crowdin:902807",
        providerKind: "crowdin",
        hyperlocaliseJobId,
        externalJobId: "task-1",
        targetLocales: ["fr"],
        isNewlySynced: true,
      }),
    );
  });

  it("continues agent automation for remaining jobs when one job fails", async () => {
    const project = {
      id: "ext:crowdin:902807",
      organizationId: "org_123",
      externalProviderKind: "crowdin",
      externalProjectId: "902807",
      source: "external_tms",
    };
    const credential = {
      id: "credential_123",
      organizationId: "org_123",
      providerKind: "crowdin",
      authMode: "api_token",
    };
    const tasks = [
      {
        externalJobId: "task-1",
        externalStatus: "in_progress",
        title: "Homepage",
        targetLocales: ["fr"],
      },
      {
        externalJobId: "task-2",
        externalStatus: "in_progress",
        title: "About",
        targetLocales: ["fr"],
      },
    ];
    const jobId1 = "ext:crowdin:902807:task-1";
    const jobId2 = "ext:crowdin:902807:task-2";

    dbSelectMock
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [project]),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [credential]),
          })),
        })),
      })
      .mockReturnValueOnce({
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
    fetchCrowdinJobTasksMock.mockResolvedValue(tasks);
    upsertExternalTmsJobRecordsMock.mockResolvedValue({
      upserted: 2,
      newlySyncedJobIds: [jobId1, jobId2],
      removed: 0,
    });
    runTmsAgentAutomationForSyncedJobMock
      .mockRejectedValueOnce(new Error("queue unavailable"))
      .mockResolvedValueOnce({ triggered: ["translate_with_agent"] });

    const result = await executeProviderSyncIntent(createJobTaskIntent());

    expect(isOk(result)).toBe(true);
    expect(runTmsAgentAutomationForSyncedJobMock).toHaveBeenCalledTimes(2);
    expect(dbUpdateMock).toHaveBeenCalled();
  });

  it("does not trigger agent automation when no jobs were newly synced", async () => {
    const project = {
      id: "ext:crowdin:902807",
      organizationId: "org_123",
      externalProviderKind: "crowdin",
      externalProjectId: "902807",
      source: "external_tms",
    };
    const credential = {
      id: "credential_123",
      organizationId: "org_123",
      providerKind: "crowdin",
      authMode: "api_token",
    };

    dbSelectMock
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [project]),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [credential]),
          })),
        })),
      })
      .mockReturnValueOnce({
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
    fetchCrowdinJobTasksMock.mockResolvedValue([
      {
        externalJobId: "task-1",
        externalStatus: "in_progress",
        title: "Homepage",
        targetLocales: ["fr"],
      },
    ]);
    upsertExternalTmsJobRecordsMock.mockResolvedValue({
      upserted: 1,
      newlySyncedJobIds: [],
      removed: 0,
    });

    const result = await executeProviderSyncIntent(createJobTaskIntent());

    expect(isOk(result)).toBe(true);
    expect(runTmsAgentAutomationForSyncedJobMock).not.toHaveBeenCalled();
  });
});
