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
import { describe, expect, it } from "vite-plus/test";

import { canCancelJob, canMarkJobFailed, type JobDetailRecord } from "./job-detail-types";

function createJob(overrides: Partial<JobDetailRecord> = {}): JobDetailRecord {
  return {
    id: "job_1",
    projectId: "project_1",
    projectName: "Acme",
    createdByUserId: null,
    ownerUserId: null,
    kind: "proofread",
    type: "file",
    status: "waiting_for_review",
    inputPayload: { sourceFileId: "file_1", targetLocales: ["fr-FR"] },
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
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("canCancelJob / canMarkJobFailed", () => {
  it("allows cancel and mark-failed for native waiting_for_review jobs", () => {
    const job = createJob();
    expect(canCancelJob(job)).toBe(true);
    expect(canMarkJobFailed(job)).toBe(true);
  });

  it("rejects cancel for provider-backed waiting_for_review jobs", () => {
    expect(
      canCancelJob(
        createJob({
          externalProviderKind: "crowdin",
          externalJobId: "task_1",
        }),
      ),
    ).toBe(false);
  });
});
