/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
  filterOverviewTriageProjectJobs,
  selectOverviewTriageProjectJobs,
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

  it("loads native project jobs with the triage filter and limit", async () => {
    const jobs = [
      createJob({ id: "job_review", status: "waiting_for_review" }),
      createJob({ id: "job_failed", status: "failed" }),
    ];
    nativeJobsGetMock.mockResolvedValue(jsonResponse({ jobs }));

    await expect(
      fetchNativeProjectJobs("acme", "project_1", { triage: true, limit: 5 }),
    ).resolves.toEqual(jobs);

    expect(nativeJobsGetMock).toHaveBeenCalledWith({
      param: { organizationSlug: "acme", projectId: "project_1" },
      query: { limit: "5", triage: true },
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

  it("keeps failed jobs in the Overview triage candidate set", () => {
    const jobs = [
      { id: "queued", status: "queued", updatedAt: "2026-07-02T00:00:00.000Z" },
      { id: "failed", status: "failed", updatedAt: "2026-07-02T00:00:04.000Z" },
      { id: "succeeded", status: "succeeded", updatedAt: "2026-07-02T00:00:05.000Z" },
      {
        id: "waiting",
        status: "waiting_for_review",
        updatedAt: "2026-07-02T00:00:02.000Z",
      },
    ];

    expect(filterOverviewTriageProjectJobs(jobs).map((job) => job.id)).toEqual([
      "queued",
      "failed",
      "waiting",
    ]);
  });

  it("applies the triage cap after review-priority selection", () => {
    const nowMs = Date.parse("2026-07-02T00:00:10.000Z");
    const jobs = [
      { id: "running-new", status: "running", updatedAt: "2026-07-02T00:00:10.000Z" },
      { id: "queued-new", status: "queued", updatedAt: "2026-07-02T00:00:09.000Z" },
      { id: "running-2", status: "running", updatedAt: "2026-07-02T00:00:08.000Z" },
      { id: "queued-2", status: "queued", updatedAt: "2026-07-02T00:00:07.000Z" },
      { id: "running-3", status: "running", updatedAt: "2026-07-02T00:00:06.000Z" },
      {
        id: "review-old",
        status: "waiting_for_review",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      { id: "failed-old", status: "failed", updatedAt: "2026-07-01T00:00:01.000Z" },
    ];

    expect(selectOverviewTriageProjectJobs(jobs, 5, nowMs).map((job) => job.id)).toEqual([
      "review-old",
      "failed-old",
      "running-new",
      "queued-new",
      "running-2",
    ]);
  });

  it("excludes triage jobs not updated in the last 7 days", () => {
    const nowMs = Date.parse("2026-08-28T12:00:00.000Z");
    const jobs = [
      {
        id: "recent-review",
        status: "waiting_for_review",
        updatedAt: "2026-08-27T12:00:00.000Z",
      },
      {
        id: "stale-review",
        status: "waiting_for_review",
        updatedAt: "2026-08-20T12:00:00.000Z",
      },
      { id: "stale-failed", status: "failed", updatedAt: "2026-08-01T00:00:00.000Z" },
      { id: "recent-queued", status: "queued", updatedAt: "2026-08-25T12:00:00.000Z" },
    ];

    expect(selectOverviewTriageProjectJobs(jobs, 5, nowMs).map((job) => job.id)).toEqual([
      "recent-review",
      "recent-queued",
    ]);
  });
});
