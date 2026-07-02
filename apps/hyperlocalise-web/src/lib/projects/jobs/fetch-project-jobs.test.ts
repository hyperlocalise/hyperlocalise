import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { JobRecord } from "@/api/routes/project/job.schema";

const { nativeJobsGetMock, tmsJobsGetMock } = vi.hoisted(() => ({
  nativeJobsGetMock: vi.fn(),
  tmsJobsGetMock: vi.fn(),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          projects: {
            ":projectId": {
              jobs: {
                $get: nativeJobsGetMock,
              },
            },
          },
          "tms-provider": {
            projects: {
              ":externalProjectId": {
                jobs: {
                  $get: tmsJobsGetMock,
                },
              },
            },
          },
        },
      },
    },
  },
}));

import {
  fetchNativeProjectJobs,
  fetchTmsProjectJobs,
  filterOpenProjectJobs,
} from "./fetch-project-jobs";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job_1",
    organizationId: "org_1",
    projectId: "project_1",
    createdByUserId: "user_1",
    ownerUserId: null,
    kind: "translation",
    type: "file",
    status: "queued",
    inputPayload: {},
    outcomeKind: null,
    outcomePayload: null,
    lastError: null,
    workflowRunId: null,
    interactionId: null,
    contextSnapshot: null,
    reviewCriteria: null,
    reviewTargetLocale: null,
    reviewConfig: null,
    syncConnectorKind: null,
    syncDirection: null,
    syncExternalIdentifiers: null,
    assetType: null,
    assetOperation: null,
    assetConfig: null,
    externalProviderKind: null,
    externalJobId: null,
    externalTaskId: null,
    externalStatus: null,
    externalTitle: null,
    externalDueDate: null,
    externalTargetLocales: null,
    externalAssignedUsers: null,
    externalUrl: null,
    externalSyncState: null,
    externalProviderPayload: null,
    linkedJobId: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("fetchProjectJobs", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads native project jobs with the requested open filter and limit", async () => {
    const jobs = [
      createJob({ id: "job_queued", status: "queued" }),
      createJob({ id: "job_running", status: "running" }),
    ];
    nativeJobsGetMock.mockResolvedValue(jsonResponse({ jobs }));

    await expect(
      fetchNativeProjectJobs("acme", "project_1", { open: true, limit: 5 }),
    ).resolves.toEqual(jobs);

    expect(nativeJobsGetMock).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", projectId: "project_1" },
      query: { limit: "5", open: true },
    });
  });

  it("loads TMS project jobs using the external project id and mine query", async () => {
    const jobs = [
      {
        status: "running",
        updatedAt: "2026-07-02T00:00:00.000Z",
      },
    ];
    tmsJobsGetMock.mockResolvedValue(jsonResponse({ jobs }));

    await expect(fetchTmsProjectJobs("acme", "902807", { mine: true })).resolves.toEqual(jobs);

    expect(tmsJobsGetMock).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", externalProjectId: "902807" },
      query: { mine: "true" },
    });
  });

  it("keeps only statuses that should count as open project jobs", () => {
    const jobs = [
      { id: "queued", status: "queued", updatedAt: "2026-07-02T00:00:00.000Z" },
      { id: "running", status: "running", updatedAt: "2026-07-02T00:00:01.000Z" },
      {
        id: "waiting",
        status: "waiting_for_review",
        updatedAt: "2026-07-02T00:00:02.000Z",
      },
      { id: "completed", status: "completed", updatedAt: "2026-07-02T00:00:03.000Z" },
      { id: "failed", status: "failed", updatedAt: "2026-07-02T00:00:04.000Z" },
    ];

    expect(filterOpenProjectJobs(jobs).map((job) => job.id)).toEqual([
      "queued",
      "running",
      "waiting",
    ]);
  });
});
