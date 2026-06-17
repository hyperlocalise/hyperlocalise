import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { notInArrayMock, selectMock, selectWhereMock, transactionMock, updateMock } = vi.hoisted(
  () => {
    const notInArrayMock = vi.fn((field: string, values: unknown[]) => [
      "notInArray",
      field,
      values,
    ]);
    const cancelJobsWhereMock = vi.fn(async () => undefined);
    const cancelJobsSetMock = vi.fn(() => ({ where: cancelJobsWhereMock }));
    const transactionUpdateMock = vi.fn(() => ({ set: cancelJobsSetMock }));
    const transactionMock = vi.fn(
      async (callback: (tx: { update: typeof transactionUpdateMock }) => Promise<void>) => {
        await callback({ update: transactionUpdateMock });
      },
    );

    const selectWhereMock = vi.fn(async () => [{ id: "job_stale_1" }, { id: "job_stale_2" }]);
    const selectInnerJoinMock = vi.fn(() => ({ where: selectWhereMock }));
    const selectFromMock = vi.fn(() => ({ innerJoin: selectInnerJoinMock }));
    const selectMock = vi.fn(() => ({ from: selectFromMock }));

    const updateMock = vi.fn();

    return {
      notInArrayMock,
      selectMock,
      selectWhereMock,
      transactionMock,
      updateMock,
    };
  },
);

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ["and", conditions]),
  eq: vi.fn((field: string, value: unknown) => ["eq", field, value]),
  inArray: vi.fn((field: string, values: unknown[]) => ["inArray", field, values]),
  ne: vi.fn((field: string, value: unknown) => ["ne", field, value]),
  notInArray: notInArrayMock,
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: selectMock,
    transaction: transactionMock,
    update: updateMock,
  },
  schema: {
    jobs: {
      id: "jobs.id",
      organizationId: "jobs.organizationId",
      projectId: "jobs.projectId",
      status: "jobs.status",
      completedAt: "jobs.completedAt",
      updatedAt: "jobs.updatedAt",
    },
    externalJobDetails: {
      jobId: "externalJobDetails.jobId",
      providerKind: "externalJobDetails.providerKind",
      syncState: "externalJobDetails.syncState",
      externalStatus: "externalJobDetails.externalStatus",
      updatedAt: "externalJobDetails.updatedAt",
    },
    projects: {
      id: "projects.id",
      organizationId: "projects.organizationId",
      lastSyncedAt: "projects.lastSyncedAt",
      updatedAt: "projects.updatedAt",
    },
  },
}));

import {
  reconcileMissingExternalTmsJobs,
  removeAllExternalTmsJobsForProject,
} from "./upsert-external-tms-job-records";

describe("reconcileMissingExternalTmsJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectWhereMock.mockResolvedValue([{ id: "job_stale_1" }, { id: "job_stale_2" }]);
  });

  it("removes all synced external jobs when the provider returns an empty task list", async () => {
    const removed = await reconcileMissingExternalTmsJobs({
      organizationId: "org_1",
      projectId: "ext:crowdin:42",
      providerKind: "crowdin",
      syncedJobIds: [],
    });

    expect(removed).toBe(2);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(notInArrayMock).not.toHaveBeenCalled();
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it("returns zero without cancelling jobs when the provider snapshot is empty and none are stored", async () => {
    selectWhereMock.mockResolvedValue([]);

    const removed = await reconcileMissingExternalTmsJobs({
      organizationId: "org_1",
      projectId: "ext:crowdin:42",
      providerKind: "crowdin",
      syncedJobIds: [],
    });

    expect(removed).toBe(0);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(notInArrayMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("removes only jobs missing from a non-empty provider snapshot", async () => {
    const removed = await reconcileMissingExternalTmsJobs({
      organizationId: "org_1",
      projectId: "ext:crowdin:42",
      providerKind: "crowdin",
      syncedJobIds: ["ext:crowdin:42:task-1"],
    });

    expect(removed).toBe(2);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(notInArrayMock).toHaveBeenCalledTimes(1);
    expect(notInArrayMock).toHaveBeenCalledWith("jobs.id", ["ext:crowdin:42:task-1"]);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});

describe("removeAllExternalTmsJobsForProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectWhereMock.mockResolvedValue([]);
  });

  it("returns zero when there are no active external jobs", async () => {
    await expect(
      removeAllExternalTmsJobsForProject({
        organizationId: "org_1",
        projectId: "ext:crowdin:42",
        providerKind: "crowdin",
      }),
    ).resolves.toBe(0);

    expect(transactionMock).not.toHaveBeenCalled();
  });
});
