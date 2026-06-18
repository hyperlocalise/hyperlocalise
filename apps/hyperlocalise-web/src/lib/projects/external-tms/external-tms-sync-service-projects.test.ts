import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { notInArrayMock, updateMock, updateReturningMock } = vi.hoisted(() => {
  const notInArrayMock = vi.fn((field: string, values: unknown[]) => ["notInArray", field, values]);
  const updateReturningMock = vi.fn(async () => [{ id: "ext:crowdin:1" }, { id: "ext:crowdin:2" }]);
  const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  return {
    notInArrayMock,
    updateMock,
    updateReturningMock,
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ["and", conditions]),
  eq: vi.fn((field: string, value: unknown) => ["eq", field, value]),
  inArray: vi.fn((field: string, values: unknown[]) => ["inArray", field, values]),
  ne: vi.fn((field: string, value: unknown) => ["ne", field, value]),
  notInArray: notInArrayMock,
}));

vi.mock("@/lib/database", () => ({
  db: {
    update: updateMock,
  },
  schema: {
    projects: {
      id: "projects.id",
      organizationId: "projects.organizationId",
      source: "projects.source",
      externalProviderKind: "projects.externalProviderKind",
      externalProviderCredentialId: "projects.externalProviderCredentialId",
      isActive: "projects.isActive",
      updatedAt: "projects.updatedAt",
    },
  },
}));

import {
  deactivateExternalTmsProject,
  deactivateMissingExternalTmsProjects,
  externalTmsSyncService,
} from "./external-tms-sync-service";

const credentialScope = {
  organizationId: "org_1",
  providerCredentialId: "cred_1",
  providerKind: "crowdin" as const,
};

describe("deactivateMissingExternalTmsProjects", () => {
  const removeAllJobsSpy = vi.spyOn(externalTmsSyncService, "removeAllJobsForProject");

  beforeEach(() => {
    vi.clearAllMocks();
    removeAllJobsSpy.mockResolvedValue(0);
    updateReturningMock.mockResolvedValue([{ id: "ext:crowdin:1" }, { id: "ext:crowdin:2" }]);
  });

  it("deactivates all external projects when the provider returns an empty project list", async () => {
    const deactivated = await deactivateMissingExternalTmsProjects({
      ...credentialScope,
      syncedProjectIds: [],
    });

    expect(deactivated).toBe(2);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(notInArrayMock).not.toHaveBeenCalled();
    expect(removeAllJobsSpy).toHaveBeenCalledTimes(2);
    expect(removeAllJobsSpy).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "ext:crowdin:1",
      providerKind: "crowdin",
    });
    expect(removeAllJobsSpy).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "ext:crowdin:2",
      providerKind: "crowdin",
    });
  });

  it("returns zero without deactivating projects when the provider snapshot is empty and none are stored", async () => {
    updateReturningMock.mockResolvedValue([]);

    const deactivated = await deactivateMissingExternalTmsProjects({
      ...credentialScope,
      syncedProjectIds: [],
    });

    expect(deactivated).toBe(0);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(notInArrayMock).not.toHaveBeenCalled();
    expect(removeAllJobsSpy).not.toHaveBeenCalled();
  });

  it("deactivates only projects missing from a non-empty provider snapshot", async () => {
    const deactivated = await deactivateMissingExternalTmsProjects({
      ...credentialScope,
      syncedProjectIds: ["ext:crowdin:1"],
    });

    expect(deactivated).toBe(2);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(notInArrayMock).toHaveBeenCalledTimes(1);
    expect(notInArrayMock).toHaveBeenCalledWith("projects.id", ["ext:crowdin:1"]);
    expect(removeAllJobsSpy).toHaveBeenCalledTimes(2);
  });
});

describe("deactivateAllProjectsForCredential", () => {
  const removeAllJobsSpy = vi.spyOn(externalTmsSyncService, "removeAllJobsForProject");

  beforeEach(() => {
    vi.clearAllMocks();
    removeAllJobsSpy.mockResolvedValue(0);
    updateReturningMock.mockResolvedValue([]);
  });

  it("returns zero when there are no active external projects", async () => {
    await expect(
      externalTmsSyncService.deactivateAllProjectsForCredential(credentialScope),
    ).resolves.toBe(0);

    expect(removeAllJobsSpy).not.toHaveBeenCalled();
  });

  it("deactivates projects and removes jobs when active external projects exist", async () => {
    updateReturningMock.mockResolvedValue([{ id: "ext:crowdin:1" }]);

    await expect(
      externalTmsSyncService.deactivateAllProjectsForCredential(credentialScope),
    ).resolves.toBe(1);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(removeAllJobsSpy).toHaveBeenCalledTimes(1);
    expect(removeAllJobsSpy).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "ext:crowdin:1",
      providerKind: "crowdin",
    });
  });
});

describe("deactivateExternalTmsProject", () => {
  const removeAllJobsSpy = vi.spyOn(externalTmsSyncService, "removeAllJobsForProject");

  beforeEach(() => {
    vi.clearAllMocks();
    removeAllJobsSpy.mockResolvedValue(0);
    updateReturningMock.mockResolvedValue([
      { id: "ext:crowdin:99", externalProviderKind: "crowdin" },
    ]);
  });

  it("deactivates an active external TMS project and removes its jobs", async () => {
    await expect(
      deactivateExternalTmsProject({
        organizationId: "org_1",
        projectId: "ext:crowdin:99",
      }),
    ).resolves.toBe(true);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(removeAllJobsSpy).toHaveBeenCalledTimes(1);
    expect(removeAllJobsSpy).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "ext:crowdin:99",
      providerKind: "crowdin",
    });
  });

  it("returns false when the external TMS project is already inactive or missing", async () => {
    updateReturningMock.mockResolvedValue([]);

    await expect(
      deactivateExternalTmsProject({
        organizationId: "org_1",
        projectId: "ext:crowdin:99",
      }),
    ).resolves.toBe(false);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(removeAllJobsSpy).not.toHaveBeenCalled();
  });
});
